/**
 * timbot-ws — OpenClaw Tencent Cloud IM bot plugin via IM Node SDK
 *
 * No REST API, no webhooks. Everything through @tencentcloud/lite-chat SDK.
 */
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";

import { setTimbotRuntime } from "./src/runtime.js";
import { timbotPlugin } from "./src/channel.js";

const plugin = {
  id: "timbot-ws",
  name: "Tencent IM",
  description: "Tencent Cloud IM intelligent bot channel via IM Node SDK",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi): void {
    setTimbotRuntime(api.runtime);
    api.registerChannel({ plugin: timbotPlugin });
  },
};

export default plugin;
