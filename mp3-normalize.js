const { resolve, dirname, basename, extname } = require("path");
const { readdir, mkdir } = require("fs").promises;
const { existsSync } = require("fs");
const { spawn } = require("child_process");

const INPUT_DIR = "/home/zinge/Музыка";
const OUT_DIR = "/home/zinge/out";

async function getFiles(dir) {
  const dirents = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    dirents.map((dirent) => {
      const res = resolve(dir, dirent.name);
      return dirent.isDirectory() ? getFiles(res) : res;
    })
  );

  return Array.prototype.concat(...files);
}

async function createNewFileDirectory(newDirName) {
  if (!existsSync(newDirName)) {
    try {
      const newDir = await mkdir(newDirName, { recursive: true });
      return newDir;
    } catch (error) {
      throw error;
    }
  }
}

function decode(currentFile, newFile) {
  const encode = spawn("ffmpeg", [
    "-hide_banner",
    "-i",
    currentFile,
    "-map",
    "0:a",
    "-af",
    "loudnorm=I=-16:TP=-1:LRA=18", // https://bva.dyndns.info/2018/10/loudness-normalization
    newFile,
  ]);

  encode.stderr.on("data", (data) => {
    console.error(`${data}`);
  });

  const promise = new Promise((resolve, reject) => {
    encode.on("error", reject);

    encode.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        const err = new Error(`Encode ${newFile} exited with code ${code}`);
        reject(err);
      }
    });
  });

  return promise;
}

async function processArray(array) {
  for (const item of array) {
    if (extname(item).toLowerCase() === ".mp3") {
      const dirName = dirname(item);
      const newDirName = dirName.replace(INPUT_DIR, OUT_DIR);
      await createNewFileDirectory(newDirName);

      const newFile = newDirName + "/" + basename(item);
      if (!existsSync(newFile)) {
        await decode(item, newFile);
      }
    }
  }
}

async function main() {
  console.log("Files hierarchy create started");
  const files = await getFiles(INPUT_DIR);
  console.log("Files hierarchy created");

  await processArray(files);
  console.log("All Done!");
}

main();
