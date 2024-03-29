const fs = require("fs");
const path = require("path");
const { name } = require("./package.json");
const uri = require("amazon-s3-uri");
const AWS = require("aws-sdk/global");
const S3 = require("aws-sdk/clients/s3");

let regions = {};
let endpoints = {};

/* return a credentials object if possible, otherwise return false */
const getCredentials = (params) => {
  if (params && params.profile) {
    // will throw if the profile is not configured
    return new AWS.SharedIniFileCredentials({ profile: params.profile });
  } else if (params && params.accessKeyId && params.secretAccessKey) {
    return {
      accessKeyId: params.accessKeyId,
      secretAccessKey: params.secretAccessKey,
    };
  } else if (process.env.AWS_PROFILE) {
    // prioritize any explicitly set params before env variables
    // will throw if the profile is not configured
    return new AWS.SharedIniFileCredentials({
      profile: process.env.AWS_PROFILE,
    });
  } else if (process.env.AWS_ACCESS_KEY && process.env.AWS_SECRET_KEY) {
    return {
      accessKeyId: process.env.AWS_ACCESS_KEY,
      secretAccessKey: process.env.AWS_SECRET_KEY,
    };
  }
};

/* create or get api instance with region */
const s3instanceWithRegion = (region, credentials) => {
  const key = region || 0;

  if (!regions.hasOwnProperty(key)) {
    const options = { region: region };

    if (credentials) options.credentials = credentials;

    regions[key] = new S3(options);
  }

  return regions[key];
};

const s3instanceWithEndpoint = (endpoint, credentials) => {
  const key = endpoint || 0;

  if (!endpoints.hasOwnProperty(key)) {
    const options = { endpoint: endpoint };

    if (credentials) options.credentials = credentials;

    endpoints[key] = new S3(options);
  }

  return endpoints[key];
};

/* define public methods */
const download = (job, settings, src, dest, params, type) => {
  src = src.replace("s3://", "http://");

  if (src.indexOf("digitaloceanspaces.com") !== -1) {
    throw new Error(
      "nexrender: Digital Ocean Spaces is not yet supported by the package: amazon-s3-uri"
    );
  }

  const parsed = uri(src);
  const file = fs.createWriteStream(dest);

  if (!parsed.bucket) {
    return Promise.reject(new Error("S3 bucket not provided."));
  }
  if (!parsed.key) {
    return Promise.reject(new Error("S3 key not provided."));
  }

  return new Promise((resolve, reject) => {
    file.on("close", resolve);

    const awsParams = {
      Bucket: parsed.bucket,
      Key: parsed.key,
    };

    const credentials = getCredentials(params.credentials);

    const s3instance = params.endpoint
      ? s3instanceWithEndpoint(params.endpoint, credentials)
      : s3instanceWithRegion(params.region, credentials);

    s3instance
      .getObject(awsParams)
      .createReadStream()
      .on("error", reject)
      .pipe(file);
  });
};

const upload = (job, settings, src, params, tags, onProgress, onComplete) => {
  const file = fs.createReadStream(src);

  if (!params.endpoint && !params.region) {
    return Promise.reject(new Error("S3 region or endpoint not provided."));
  }
  if (!params.bucket) {
    return Promise.reject(new Error("S3 bucket not provided."));
  }
  if (!params.key) {
    return Promise.reject(new Error("S3 key not provided."));
  }
  if (!params.acl) {
    return Promise.reject(new Error("S3 ACL not provided."));
  }

  const onUploadProgress = (e) => {
    const progress = Math.ceil((e.loaded / e.total) * 100);
    if (typeof onProgress == "function") {
      onProgress(job, progress);
    }
    settings.logger.log(
      `[${job.uid}] action-upload: upload progress ${progress}%...`
    );
  };

  const onUploadComplete = (file) => {
    if (typeof onComplete == "function") {
      onComplete(job, file);
    }
    settings.logger.log(`[${job.uid}] action-upload: upload complete: ${file}`);
  };

  const output = params.endpoint
    ? (`${params.endpoint}/${params.key}`).replace("https://", `https://${params.bucket}.`)// upload is digital ocean
    : `https://s3-${params.region}.amazonaws.com/${params.bucket}/${params.key}`;
  settings.logger.log(`[${job.uid}] action-upload: input file ${src}`);
  settings.logger.log(`[${job.uid}] action-upload: output file ${output}`);

  return new Promise((resolve, reject) => {
    file.on("error", (err) => reject(err));

    const awsParams = {
      Bucket: params.bucket,
      Key: params.key,
      ACL: params.acl,
      Body: file,
      ContentType: params.ContentType || "video/mp4"
    };
    if (params.metadata) awsParams.Metadata = params.metadata;

    const credentials = getCredentials(params.credentials);

    const s3instance = params.endpoint
      ? s3instanceWithEndpoint(params.endpoint, credentials)
      : s3instanceWithRegion(params.region, credentials);

    s3instance
      .upload(awsParams, { tags }, (err, data) => {
        if (err) {
          reject(err);
        } else {
          onUploadComplete(output ||
            (data.Location.startsWith("http")
              ? data.Location
              : `https://${data.Location}`));
          resolve();
        }
      })
      .on("httpUploadProgress", onUploadProgress);
  });
};

module.exports = (
  job,
  settings,
  { input, params, onStart, onComplete, ...options },
  type
) => {
  onStart()
  return new Promise((resolve, reject) => {
    let onProgress;
    let tags = null
    if (type != "postrender") {
      throw new Error(
        `Action ${name} can be only run in postrender mode, you provided: ${type}.`
      );
    }

    /* check if input has been provided */
    input = input || job.output;

    /* fill absolute/relative paths */
    if (!path.isAbsolute(input)) input = path.join(job.workpath, input);

    if (
      options.hasOwnProperty("onProgress") &&
      typeof options["onProgress"] == "function"
    ) {
      onProgress = (job, progress) => options.onProgress(job, progress);
    }

    if (options.hasOwnProperty('tags') && options.tags.hasOwnProperty('length') && options.tags.length) {
      tags = options.tags
    }

    // if (
    //   options.hasOwnProperty("onComplete") &&
    //   typeof options["onComplete"] == "function"
    // ) {
    //   onComplete = (job, file) => onComplete(job, file);
    // }

    settings.logger.log(`[${job.uid}] starting action-upload action`);
    try {
      upload(job, settings, input, params || {}, tags || [], onProgress, (job, file) => {
        job.output = file;
        onComplete()
        resolve(job);
      });
    } catch (e) {
      onComplete()
      reject(job);
    }
  });
};
