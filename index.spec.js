const actionUpload = require("./index");

actionUpload(
  { output: "./output.mp4", workpath: "./" },
  { logger: console },
  {
    provider: "s3",
    params: {
      //   accessKeyId: params.accessKeyId,
      //   secretAccessKey: params.secretAccessKey,
      region: "us-east-1",
      bucket: "spiring-creator",
      key: `outputs/test_upload_1.mp4`,
      acl: "public-read",
    },
  },
  "postrender"
).then(console.log);
