/**
 * ws-transport.ts
 * 
 * 封装腾讯 IM SDK 的 WebSocket 传输层，处理消息收发和连接管理。
 */

// @ts-expect-error 运行时路径有效
import TencentCloudChat from "../im-sdk-bundle/node.es.js";

const Chat: any = TencentCloudChat;

// 启动时记录 SDK 入口
console.log("[timbot-ws] SDK entry: im-sdk-bundle/node.es.js");

import { logSimple } from "./logger.js";

export type Message = any;

export type WsTransportOptions = {
  sdkAppId: number;
  userID: string;
  userSig?: string;
  /** 动态获取 UserSig 的函数，优先于静态 userSig */
  userSigProvider?: () => Promise<string>;
  log?: (level: "info" | "warn" | "error", message: string) => void;
};

export type WsSendResult = {
  ok: boolean;
  message?: Message;
  error?: string;
};

/** 网络状态枚举 */
export type NetState = "connected" | "connecting" | "disconnected";

/** 网络状态变化事件 */
export type NetStateChangeEvent = {
  state: NetState;
  rawState: string;
};

/**
 * WsTransport 封装 IM SDK 的 WebSocket 连接和消息操作
 */
export class WsTransport {
  private chat: any;
  private sdkAppId: number;
  private userID: string;
  private userSig?: string;
  private userSigProvider?: () => Promise<string>;
  private _log: (level: "info" | "warn" | "error", message: string) => void;
  private _ready = false;
  private _destroyed = false;
  private _loginTime = 0;
  private _messageHandler: ((event: { data: Message[] }) => void) | null = null;
  private _netState: NetState = "disconnected";
  private _netStateChangeHandler: ((event: NetStateChangeEvent) => void) | null = null;

  constructor(options: WsTransportOptions) {
    this.sdkAppId = options.sdkAppId;
    this.userID = options.userID;
    this.userSig = options.userSig;
    this.userSigProvider = options.userSigProvider;
    this._log = options.log ?? ((level, msg) => logSimple(level, msg));

    this.chat = Chat.create({ SDKAppID: this.sdkAppId });

    this.chat.on(Chat.EVENT.SDK_READY, () => {
      this._ready = true;
      this._log("info", `[ws-transport] SDK ready, sdkAppId=${this.sdkAppId}, userID=${this.userID}`);
    });

    this.chat.on(Chat.EVENT.SDK_NOT_READY, () => {
      this._ready = false;
      this._log("warn", "[ws-transport] SDK not ready");
    });

    this.chat.on(Chat.EVENT.KICKED_OUT, (event: any) => {
      const type = event?.data?.type ?? "unknown";
      this._ready = false;
      if (type === Chat.TYPES.KICKED_OUT_USERSIG_EXPIRED) {
        this._log("warn", "[ws-transport] kicked out: userSig expired, attempting relogin");
        this._relogin().catch((err: any) => {
          this._log("error", `[ws-transport] relogin failed: ${String(err)}`);
        });
      } else {
        this._log("warn", `[ws-transport] kicked out: type=${type}`);
      }
    });

    this.chat.on(Chat.EVENT.NET_STATE_CHANGE, (event: any) => {
      const rawState = event?.data?.state ?? "unknown";
      let state: NetState = "disconnected";
      
      // 根据 SDK 状态映射到我们的状态
      if (rawState === Chat.TYPES.NET_STATE_CONNECTED) {
        state = "connected";
      } else if (rawState === Chat.TYPES.NET_STATE_CONNECTING) {
        state = "connecting";
      } else if (rawState === Chat.TYPES.NET_STATE_DISCONNECTED) {
        state = "disconnected";
      }
      
      this._netState = state;
      this._log("info", `[ws-transport] network state: ${state} (raw: ${rawState})`);
      
      // 触发回调
      if (this._netStateChangeHandler) {
        this._netStateChangeHandler({ state, rawState });
      }
    });
  }

  /** 登录时间戳，用于过滤历史消息 */
  get loginTime(): number {
    return this._loginTime;
  }

  get isReady(): boolean {
    return this._ready && !this._destroyed;
  }

  /** 获取当前网络状态 */
  get netState(): NetState {
    return this._netState;
  }

  /** 是否已连接到网络 */
  get isConnected(): boolean {
    return this._netState === "connected" && this._ready && !this._destroyed;
  }

  /** 注册网络状态变化回调 */
  onNetStateChange(handler: (event: NetStateChangeEvent) => void): void {
    this._netStateChangeHandler = handler;
    this._log("info", "[ws-transport] network state change handler registered");
  }

  /** 获取有效的 UserSig，优先使用 provider 动态获取 */
  private async resolveUserSig(): Promise<string> {
    if (this.userSigProvider) {
      this._log("info", "[ws-transport] fetching userSig from provider...");
      const sig = await this.userSigProvider();
      if (!sig?.trim()) {
        throw new Error("[ws-transport] userSigProvider returned empty sig");
      }
      this.userSig = sig;
      return sig;
    }
    if (!this.userSig?.trim()) {
      throw new Error("[ws-transport] userSig is required (no static sig and no provider configured)");
    }
    return this.userSig;
  }

  async login(): Promise<void> {
    const sig = await this.resolveUserSig();

    this._log("info", `[ws-transport] login: userID=${this.userID}, sdkAppId=${this.sdkAppId}`);
    this._loginTime = Math.floor(Date.now() / 1000);
    await this.chat.login({ userID: this.userID, userSig: sig });
    this._log("info", "[ws-transport] login successful");

    if (!this._ready) {
      await this._waitForReady(10_000);
    }
  }

  private async _relogin(): Promise<void> {
    const sig = await this.resolveUserSig();
    this._loginTime = Math.floor(Date.now() / 1000);
    await this.chat.login({ userID: this.userID, userSig: sig });
    this._log("info", "[ws-transport] relogin successful");
  }

  private _waitForReady(timeoutMs: number): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this._ready) {
        resolve();
        return;
      }
      const timer = setTimeout(() => {
        reject(new Error(`[ws-transport] SDK_READY timeout after ${timeoutMs}ms`));
      }, timeoutMs);
      const handler = () => {
        clearTimeout(timer);
        resolve();
      };
      this.chat.on(Chat.EVENT.SDK_READY, handler);
    });
  }

  /** 注册消息接收回调 */
  onMessageReceived(handler: (messageList: Message[]) => void): void {
    if (this._messageHandler) {
      this.chat.off(Chat.EVENT.MESSAGE_RECEIVED, this._messageHandler);
    }
    this._messageHandler = (event: { data: Message[] }) => {
      const count = event?.data?.length ?? 0;
      this._log("info", `[ws-transport] received ${count} message(s)`);
      if (count > 0) {
        for (const msg of event.data) {
          this._log("info", `[ws-transport] msg: type=${msg?.type}, conv=${msg?.conversationType}, from=${msg?.from}, to=${msg?.to}, nick=${msg?.nick || "N/A"}, nameCard=${msg?.nameCard || "N/A"}, avatar=${msg?.avatar ? "yes" : "N/A"}`);
        }
      }
      handler(event.data);
    };
    this.chat.on(Chat.EVENT.MESSAGE_RECEIVED, this._messageHandler);
    this._log("info", "[ws-transport] message handler registered");
  }

  /** 发送 C2C 文本消息 */
  async sendC2CTextMessage(toUserID: string, text: string): Promise<WsSendResult> {
    return this._sendTextMessage(toUserID, Chat.TYPES.CONV_C2C, text);
  }

  /** 发送群文本消息 */
  async sendGroupTextMessage(groupID: string, text: string): Promise<WsSendResult> {
    return this._sendTextMessage(groupID, Chat.TYPES.CONV_GROUP, text);
  }

  /** 发送 C2C 自定义消息 */
  async sendC2CCustomMessage(toUserID: string, data: string, description?: string): Promise<WsSendResult> {
    return this._sendCustomMessage(toUserID, Chat.TYPES.CONV_C2C, data, description);
  }

  /** 发送群自定义消息 */
  async sendGroupCustomMessage(groupID: string, data: string, description?: string): Promise<WsSendResult> {
    return this._sendCustomMessage(groupID, Chat.TYPES.CONV_GROUP, data, description);
  }

  /** 修改已发送消息 */
  async modifyMessage(
    originalMessage: Message,
    newPayload: { text: string } | { data: string; description?: string },
  ): Promise<{ ok: boolean; message?: Message; error?: string }> {
    try {
      // 修改 payload
      if ("text" in newPayload) {
        originalMessage.payload = { text: newPayload.text };
        originalMessage.type = Chat.TYPES.MSG_TEXT;
      } else {
        originalMessage.payload = {
          data: newPayload.data,
          description: newPayload.description ?? "",
          extension: "",
        };
        originalMessage.type = Chat.TYPES.MSG_CUSTOM;
      }

      const result = await this.chat.modifyMessage(originalMessage);
      const msg = result?.data?.message ?? originalMessage;
      return { ok: true, message: msg };
    } catch (err: any) {
      const errMsg = err?.message ?? String(err);
      this._log("error", `[ws-transport] modifyMessage failed: ${errMsg}`);
      return { ok: false, error: errMsg };
    }
  }

  /**
   * 发送流式消息
   * 注意: SDK 不支持 TIMStreamElem，请使用 text_modify 或 custom_modify 模式
   */
  async sendStreamMessage(_options: {
    to: string;
    conversationType: "C2C" | "GROUP";
    chunks: Array<{ index: number; markdown: string; isLast: boolean }>;
    compatibleText?: string;
    streamMsgId?: string;
  }): Promise<WsSendResult> {
    return { ok: false, error: "TIMStreamElem not supported via SDK WebSocket" };
  }

  /** 销毁连接 */
  async destroy(): Promise<void> {
    if (this._destroyed) return;
    this._destroyed = true;

    if (this._messageHandler) {
      this.chat.off(Chat.EVENT.MESSAGE_RECEIVED, this._messageHandler);
      this._messageHandler = null;
    }

    try {
      await this.chat.logout();
    } catch {
      // 忽略登出错误
    }

    try {
      await this.chat.destroy();
    } catch {
      // 忽略销毁错误
    }

    this._ready = false;
    this._log("info", "[ws-transport] destroyed");
  }

  private async _sendTextMessage(
    to: string,
    conversationType: any,
    text: string,
  ): Promise<WsSendResult> {
    try {
      const msg = this.chat.createTextMessage({
        to,
        conversationType,
        payload: { text },
      });
      const result = await this.chat.sendMessage(msg);
      const sentMessage: Message = result?.data?.message ?? msg;
      return { ok: true, message: sentMessage };
    } catch (err: any) {
      const errMsg = err?.message ?? String(err);
      this._log("error", `[ws-transport] sendTextMessage to ${to} failed: ${errMsg}`);
      return { ok: false, error: errMsg };
    }
  }

  private async _sendCustomMessage(
    to: string,
    conversationType: any,
    data: string,
    description?: string,
  ): Promise<WsSendResult> {
    try {
      const msg = this.chat.createCustomMessage({
        to,
        conversationType,
        payload: {
          data,
          description: description ?? "",
          extension: "",
        },
      });
      const result = await this.chat.sendMessage(msg);
      const sentMessage: Message = result?.data?.message ?? msg;
      return { ok: true, message: sentMessage };
    } catch (err: any) {
      const errMsg = err?.message ?? String(err);
      this._log("error", `[ws-transport] sendCustomMessage to ${to} failed: ${errMsg}`);
      return { ok: false, error: errMsg };
    }
  }
}
