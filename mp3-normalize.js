const { resolve, dirname, basename, extname } = require("path");
const { readdir, mkdir } = require("fs").promises;
const { existsSync } = require("fs");
const { spawn } = require("child_process");
const endOfLine = require("os").EOL;

const FFMPEG = 'ffmpeg'
const MP3 = ".mp3";

class Decoder {
    constructor(engine) {
        this._engine = engine
    }

    async run(file, newFile) {
        const cli = spawn(this._engine, [
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
            512,
            newFile,
        ], { stdio: "inherit" })

        const promise = new Promise((resolve, reject) => {
            cli.on("error", reject);

            cli.on("exit", (code) => {
                if (code === 0) {
                    resolve();
                } else {
                    const err = new Error(`Encode ${file} exited with code ${code}`);

                    reject(err);
                }
            });
        });

        return promise;
    }
}

class App {
    constructor(input, output) {
        this._input = input
        this._output = output
        this._files = []
        this._ext = MP3
    }

    setEngine(engine) {
        this._engine = engine

        return this
    }

    async getFiles(dir) {
        try {
            const dirents = await readdir(dir, { withFileTypes: true });
            const files = await Promise.all(
                dirents.map((dirent) => {
                    const res = resolve(dir, dirent.name);

                    return dirent.isDirectory() ? this.getFiles(res) : res;
                })
            );

            return Array.prototype.concat(...files);
        } catch (error) {
            throw error
        }
    }

    async createDirIfNotExist(dir) {
        try {
            if (!existsSync(dir)) {
                await mkdir(dir, { recursive: true })
            }
        } catch (error) {
            throw error
        }
    }

    async processFiles() {
        const totalFiles = this._files.length;
        const onePercent = totalFiles / 100;

        try {
            for (let index = 0; index < totalFiles; index++) {
                const file = this._files[index];

                if (extname(file).toLowerCase() === this._ext) {
                    const dirName = dirname(file);
                    const newDirName = dirName.replace(this._input, this._output);
                    await this.createDirIfNotExist(newDirName);

                    const newFile = newDirName + "/" + basename(file);
                    if (!existsSync(newFile)) {
                        console.log(
                            "\x1b[36m%s\x1b[0m",
                            `${endOfLine}~~~~~> Process ${index} of ${totalFiles} (${(
                                index / onePercent
                            ).toFixed(2)} %)`
                        );

                        await this._engine.run(file, newFile);
                    }
                }
            }
        } catch (error) {
            throw error
        }
    }

    async start() {
        try {
            if (!existsSync(this._input)) {
                throw (
                    "\x1b[31m%s\x1b[0m",
                    "Input directory not exist, fix INPUT_DIR value"
                );
            }

            if (!existsSync(OUT_DIR)) {
                throw (
                    "\x1b[31m%s\x1b[0m",
                    "Output directory not exist, fix OUT_DIR value"
                );
            }

            console.log("Files hierarchy create started");
            this._files = await this.getFiles(this._input)
            console.log("Files hierarchy created");

            await this.processFiles();
            console.log(`${endOfLine}All Done!`);
        } catch (error) {
            console.error(`${error}`)
        }
    }
}

const INPUT_DIR = "/home/zinge/Музыка";
const OUT_DIR = "/home/zinge/out";

new App(INPUT_DIR, OUT_DIR).setEngine(new Decoder(FFMPEG)).start()
