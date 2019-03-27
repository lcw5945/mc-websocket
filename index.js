const WebSocket = require("ws");
const Log = require("mc-log");
const EventEmitter = require("events");

function noop() {}

class ReconnectingWebSocket extends EventEmitter {
  constructor(url, options) {
    super();
    this._ws = null;
    this._pingTimeoutId = null;
    this._heartbeatTimeout = options.heartbeatTimeout || 30000;
    this.url = url;
    this._reconnTimeout = options.reconnTimeout || 5000;
    this._reconnTimeoutId = null;

    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = options.maxReconnectAttempts || 3;
    this.readyState = WebSocket.CONNECTING;

    this._forcedClose = false;

    this.CONNECTING = WebSocket.CONNECTING;
    this.OPEN = WebSocket.OPEN;
    this.CLOSING = WebSocket.CLOSING;
    this.CLOSED = WebSocket.CLOSED;
  }

  open(reconnectAttempt) {
    let ws = new WebSocket(this.url);

    if (reconnectAttempt) {
      Log.warn(
        `MCMonit  reconnectAttempts ${
          this.reconnectAttempts
        } maxReconnectAttempts ${this.maxReconnectAttempts}`
      );
      if (
        this.maxReconnectAttempts != 0 &&
        this.reconnectAttempts > this.maxReconnectAttempts
      ) {
        this.readyState = WebSocket.CLOSED;
        this.close();
        this.emit("crash", "server 500 error");
      }
    } else {
      this.reconnectAttempts = 0;
      this.emit("connenting");
    }

    ws.on("open", () => {
      this.readyState = WebSocket.OPEN;
      this.emit("open");
    });

    ws.on("ping", () => {
      Log.log("MCMonit received %:  ping");
      ws.pong(noop);

      clearTimeout(this._pingTimeoutId);
      this._pingTimeoutId = setTimeout(() => {
        Log.warn("MCMonit heartTimeout reconnect");
        this._reconnect();
      }, this._heartbeatTimeout);
    });

    ws.on("close", () => {
      if (this._forcedClose) {
        this.readyState = WebSocket.CLOSED;
        this.emit("close");
      } else {
        this._reconnect();
      }
    });

    ws.on("message", data => {
      this.emit("message", data);
    });

    ws.on("error", event => {
      this.emit("error", event);
    });

    this._ws = ws;
  }
  /**
   * 发送数据
   * @param {*} data
   */
  send(data) {
    try {
      if (this._ws && this.readyState === WebSocket.OPEN) {
        this._ws.send(data);
      } else {
        throw "ws is null, stop to reconnect websocket";
      }
    } catch (e) {
      Log.error(e);
    }
  }
  /**
   * 关闭
   * @param {*} code //a default value of 1005
   * @param {*} reason
   */
  close(code, reason) {
    Log.log("MCMonit closed");

    if (typeof code == "undefined") {
      code = 1000;
    }
    this._forcedClose = true;
    if (this._ws) {
      this._ws.close(code, reason);
    }
  }

  /**
   * 重新链接
   */
  _reconnect() {
    Log.log("MCMonit reconnect");

    if (
      this.maxReconnectAttempts != 0 &&
      this.reconnectAttempts > this.maxReconnectAttempts
    ) {
      return;
    }

    clearTimeout(this._reconnTimeoutId);
    this.readyState = WebSocket.CONNECTING;
    this.emit("connecting");
    this._reconnTimeoutId = setTimeout(() => {
      this.reconnectAttempts++;
      this.open(true);
    }, this._reconnTimeout);
  }
}

module.exports = ReconnectingWebSocket;
