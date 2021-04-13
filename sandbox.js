const upload = require("./index")
const input = 'output.mp4'
let started = Date.now()
upload(
    { output: "C:\\Users\\Utkarsh\\Desktop", workpath: "C:\\Users\\Utkarsh\\Desktop" },
    { logger: { log: console.log }, workpath: "C:\\Users\\Utkarsh\\Desktop" }, {
    input,
    params: {
        region: "us-east-1",
        bucket: "spiring-creator",
        key: `file.mp4`,
        acl: "public-read",
        ContentType: 'video/mp4',
        credentials: {
            accessKeyId: "",
            secretAccessKey: ""

        }
    },
    tags: [{ Key: 'deleteAfter90Days', Value: '90 Days' }],
    onStart: () => {
        console.log("Started")
        started = Date.now()
    },
    onComplete: () => console.log("completed in", (Date.now() - started) / 1000, " secs")
}, 'postrender')