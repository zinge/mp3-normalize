#!/usr/bin/node

import { promises } from "fs";
import { cwd } from "process";
import { resolve, extname, parse, format } from "path";
import { createHash } from "crypto";
import { spawn } from "child_process";
import { EOL } from "os";

const { readdir, rename, unlink } = promises;

const FFMPEG = "ffmpeg";
const RSYNC = "rsync";

class Engine {
  constructor(cli) {
    this._cli = cli;
  }

  run(params) {
    const cli = spawn(this._cli, params, { stdio: "inherit" });

    const promise = new Promise((resolve, reject) => {
      cli.on("error", reject);

      cli.on("exit", (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(code);
        }
      });
    });

    return promise;
  }
}

class Backup {
  constructor(engine) {
    this._engine = engine;
    this._backupDirSuffix = "origin";
  }

  params(path) {
    return [
      "--progress",
      "--recursive",
      ".",
      path + "-" + this._backupDirSuffix,
    ];
  }

  async run(path) {
    const params = this.params(path);

    await this._engine.run(params);
  }
}

class File {
  constructor(path, convertEngine) {
    this._path = path;
    this._convertEngine = convertEngine;
  }

  convertParams(file, newFile) {
    return [
      "-hide_banner",
      "-i",
      file,
      "-map",
      "0:a",
      "-af",
      "loudnorm=I=-16:TP=-1:LRA=20", // https://bva.dyndns.info/2018/10/loudness-normalization
      "-ar",
      "48k",
      "-max_muxing_queue_size",
      2048,
      newFile,
    ];
  }

  tempFileName(hash) {
    const { dir, name, ext } = parse(this._path);

    return format({ dir, name: name + "_" + hash, ext });
  }

  async convert(hash) {
    try {
      const tempFile = this.tempFileName(hash);

      await this._convertEngine.run(
        this.convertParams(this.filePath(), tempFile)
      );

      await unlink(this.filePath());
      await rename(tempFile, this.filePath());
    } catch (error) {
      throw error;
    }
  }

  filePath() {
    return this._path;
  }
}

class App {
  constructor(convertEngine) {
    this._mp3 = ".mp3";
    this._recursive = false;
    this._hash = this.getHash();
    this._convertEngine = convertEngine;
    this._backup = null;
  }

  isMp3File(name) {
    return extname(name) === this._mp3;
  }

  recursive() {
    this._recursive = true;

    return this;
  }

  withBackup(backup) {
    this._backup = backup;

    return this;
  }

  getHash() {
    const timeStamp = Date.now().toString();

    return createHash("md5").update(timeStamp).digest("hex");
  }

  async getMp3Files(dir) {
    try {
      const files = [];
      const dirents = await readdir(dir, { withFileTypes: true });

      for (const dirent of dirents) {
        const res = resolve(dir, dirent.name);

        if (this._recursive && dirent.isDirectory()) {
          const dirFiles = await this.getMp3Files(res);

          files.push(...dirFiles);
        } else {
          if (this.isMp3File(res)) {
            files.push(new File(res, this._convertEngine));
          }
        }
      }

      return files;
    } catch (error) {
      console.error(error);
    }
  }

  async start(pwd) {
    if (this._backup) await this._backup.run(pwd);
    const data = await this.getMp3Files(pwd);
    const totalFiles = data.length;
    const onePercent = totalFiles / 100;

    for (let index = 0; index < totalFiles; index++) {
      try {
        const file = data[index];

        console.log(
          "\x1b[36m%s\x1b[0m",
          `${EOL}process (${index + 1} of ${totalFiles}, ${(
            index / onePercent
          ).toFixed(2)} %) : ${file.filePath()}`
        );
        await file.convert(this._hash);
      } catch (error) {
        console.error(error);
      }
    }
  }
}

new App(new Engine(FFMPEG))
  .withBackup(new Backup(new Engine(RSYNC)))
  .recursive()
  .start(cwd());
