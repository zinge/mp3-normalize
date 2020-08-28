const { resolve, dirname, basename, extname } = require("path");
const { readdir, mkdir } = require("fs").promises;
const { existsSync } = require("fs");
const { spawn } = require("child_process");
const endOfLine = require("os").EOL;

const INPUT_DIR = "/home/zinge/Музыка";
const OUT_DIR = "/home/zinge/out";
const MP3 = ".mp3";

async function getFiles(dir) {
  try {
    const dirents = await readdir(dir, { withFileTypes: true });
    const files = await Promise.all(
      dirents.map((dirent) => {
        const res = resolve(dir, dirent.name);
        return dirent.isDirectory() ? getFiles(res) : res;
      })
    );

    return Array.prototype.concat(...files);
  } catch (error) {
    throw error;
  }
}

async function createNewFileDirectory(newDirName) {
  try {
    if (!existsSync(newDirName)) {
      await mkdir(newDirName, { recursive: true });
    }
  } catch (error) {
    throw error;
  }
}

function decode(currentFile, newFile) {
  const encode = spawn(
    "ffmpeg",
    [
      "-hide_banner",
      "-i",
      currentFile,
      "-map",
      "0:a",
      "-af",
      "loudnorm=I=-16:TP=-1:LRA=20", // https://bva.dyndns.info/2018/10/loudness-normalization
      "-ar",
      "48k",
      "-max_muxing_queue_size",
      512,
      newFile,
    ],
    { stdio: "inherit" }
  );

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

async function processFiles(files) {
  const totalFiles = files.length;
  const onePercent = totalFiles / 100;

  try {
    for (let index = 0; index < totalFiles; index++) {
      const file = files[index];

      if (extname(file).toLowerCase() === MP3) {
        const dirName = dirname(file);
        const newDirName = dirName.replace(INPUT_DIR, OUT_DIR);
        await createNewFileDirectory(newDirName);

        const newFile = newDirName + "/" + basename(file);
        if (!existsSync(newFile)) {
          console.log(
            "\x1b[36m%s\x1b[0m",
            `${endOfLine}~~~~~> Process ${index} of ${totalFiles} (${(
              index / onePercent
            ).toFixed(2)} %)`
          );

          await decode(file, newFile);
        }
      }
    }
  } catch (error) {
    throw error;
  }
}

async function main() {
  try {
    if (!existsSync(INPUT_DIR)) {
      console.log(
        "\x1b[31m%s\x1b[0m",
        "Input directory not exist, fix INPUT_DIR value"
      );

      return;
    }

    if (!existsSync(OUT_DIR)) {
      console.log(
        "\x1b[31m%s\x1b[0m",
        "Output directory not exist, fix OUT_DIR value"
      );

      return;
    }

    console.log("Files hierarchy create started");
    const files = await getFiles(INPUT_DIR);
    console.log("Files hierarchy created");

    await processFiles(files);
    console.log(`${endOfLine}All Done!`);
  } catch (error) {
    throw error;
  }
}

main();
