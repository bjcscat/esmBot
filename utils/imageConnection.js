import fetch from "node-fetch";
import WebSocket from "ws";
import * as logger from "./logger.js";
import { setTimeout } from "timers/promises";

/*
Rerror 0x01
Tqueue 0x02
Rqueue 0x03
Tcancel 0x04
Rcancel 0x05
Twait 0x06
Rwait 0x07
Rinit 0x08
*/
const Rerror = 0x01;
const Tqueue = 0x02;
//const Rqueue = 0x03;
const Tcancel = 0x04;
//const Rcancel = 0x05;
const Twait = 0x06;
//const Rwait = 0x07;
const Rinit = 0x08;

class ImageConnection {
  constructor(host, auth, tls = false) {
    this.requests = new Map();
    this.host = host;
    this.auth = auth;
    this.tag = null;
    this.disconnected = false;
    this.njobs = 0;
    this.max = 0;
    this.formats = {};
    this.wsproto = null;
    if (tls) {
      this.wsproto = "wss";
    } else {
      this.wsproto = "ws";
    }
    this.sockurl = `${this.wsproto}://${host}/sock`;
    this.conn = new WebSocket(this.sockurl, {
      headers: {
        "Authentication": auth && auth !== "" ? auth : undefined
      }
    });
    let httpproto;
    if (tls) {
      httpproto = "https";
    } else {
      httpproto = "http";
    }
    this.httpurl = `${httpproto}://${host}/image`;
    this.conn.on("message", (msg) => this.onMessage(msg));
    this.conn.once("error", (err) => this.onError(err));
    this.conn.once("close", () => this.onClose());
  }

  onMessage(msg) {
    const op = msg.readUint8(0);
    if (op === Rinit) {
      this.max = msg.readUint16LE(1);
      this.formats = JSON.parse(msg.toString("utf8", 3));
      return;
    }
    const tag = msg.readUint32LE(1);
    const promise = this.requests.get(tag);
    this.requests.delete(tag);
    if (op === Rerror) {
      promise.reject(new Error(msg.slice(5, msg.length).toString()));
      return;
    }
    promise.resolve();
  }

  onError(e) {
    logger.error(e.toString());
  }

  async onClose() {
    for (const promise of this.requests.values()) {
      promise.reject(new Error("Request ended prematurely due to a closed connection"));
    }
    this.requests.clear();
    if (!this.disconnected) {
      logger.warn(`Lost connection to ${this.host}, attempting to reconnect in 5 seconds...`);
      await setTimeout(5000);
      this.conn = new WebSocket(this.sockurl, {
        headers: {
          "Authentication": this.auth
        }
      });
      this.conn.on("message", (msg) => this.onMessage(msg));
      this.conn.once("error", (err) => this.onError(err));
      this.conn.once("close", () => this.onClose());
    }
    this.disconnected = false;
  }

  close() {
    this.disconnected = true;
    this.conn.close();
  }

  queue(jobid, jobobj) {
    const str = JSON.stringify(jobobj);
    const buf = Buffer.alloc(4 + str.length);
    buf.writeUint32LE(jobid);
    buf.write(str, 4);
    return this.do(Tqueue, buf);
  }

  wait(jobid) {
    const buf = Buffer.alloc(4);
    buf.writeUint32LE(jobid);
    return this.do(Twait, buf);
  }

  cancel(jobid) {
    const buf = Buffer.alloc(4);
    buf.writeUint32LE(jobid);
    return this.do(Tcancel, buf);
  }

  async getOutput(jobid) {
    const req = await fetch(`${this.httpurl}?id=${jobid}`, {
      headers: {
        "Authentication": this.auth && this.auth !== "" ? this.auth : undefined
      }
    });
    const contentType = req.headers.get("Content-Type");
    let type;
    switch (contentType) {
      case "image/gif":
        type = "gif";
        break;
      case "image/png":
        type = "png";
        break;
      case "image/jpeg":
        type = "jpg";
        break;
      case "image/webp":
        type = "webp";
        break;
    }
    return { buffer: Buffer.from(await req.arrayBuffer()), type };
  }

  async do(op, data) {
    const buf = Buffer.alloc(1 + 4);
    const tag = this.tag++;
    buf.writeUint8(op);
    buf.writeUint32LE(tag, 1);
    this.conn.send(Buffer.concat([buf, data]));
    const promise = new Promise((resolve, reject) => {
      this.requests.set(tag, { resolve, reject });
    });
    return promise;
  }
}

export default ImageConnection;