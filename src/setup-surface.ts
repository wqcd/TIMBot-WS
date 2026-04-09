import type {
  ChannelSetupWizard,
  OpenClawConfig,
} from "openclaw/plugin-sdk/setup";
import {
  createStandardChannelSetupStatus,
  DEFAULT_ACCOUNT_ID,
  formatDocsLink,
} from "openclaw/plugin-sdk/setup";
import { listTimbotAccountIds, resolveTimbotAccount } from "./accounts.js";
import type { TimbotConfig } from "./types.js";

const channel = "timbot-ws" as const;

const TIMBOT_WS_SETUP_HELP_LINES = [
  "You'll need these values from Tencent Cloud IM Console:",
  "",
  "- SDKAppID: https://console.cloud.tencent.com/im",
  "- UserID (identifier for bot login)",
  "- UserSig (generated from console or SDK)",
  "",
  "UserSig validity: recommend 10 years (315360000 seconds).",
  "If leaked, you can revoke it via RESTful API:",
  "https://cloud.tencent.com/document/product/269/3853",
  "",
  "No webhook or public IP needed - timbot-ws connects via WebSocket.",
  "",
  `Full setup guide: ${formatDocsLink("/channels/timbot-ws", "timbot-ws")}`,
];

const USERSIG_HELP_LINES = [
  "UserSig is your login signature.",
  "",
  "Generate it from:",
  "- Tencent IM Console: Development Tools > UserSig Generation",
  "- Or use the provided debug tool",
  "",
  "Set expiration to 10 years (315360000 seconds) for production use.",
  "If UserSig is leaked, revoke via RESTful API to invalidate it.",
  "",
  "Docs: https://cloud.tencent.com/document/product/269/32688",
];

function isTimbotWsConfigured(cfg: OpenClawConfig, accountId: string): boolean {
  const account = resolveTimbotAccount({ cfg, accountId });
  return account.configured;
}

function getRawAccountConfig(cfg: OpenClawConfig, accountId: string): Record<string, any> {
  const timbotCfg = cfg.channels?.["timbot-ws"] as TimbotConfig | undefined;
  if (!timbotCfg) return {};
  if (accountId === DEFAULT_ACCOUNT_ID) return timbotCfg as Record<string, any>;
  return (timbotCfg.accounts?.[accountId] ?? {}) as Record<string, any>;
}

function patchTimbotWsAccountConfig(params: {
  cfg: OpenClawConfig;
  accountId: string;
  enabled?: boolean;
  patch: Record<string, unknown>;
}): OpenClawConfig {
  const { cfg, accountId, enabled, patch } = params;
  const existing = (cfg.channels?.["timbot-ws"] ?? {}) as Record<string, any>;

  if (accountId === DEFAULT_ACCOUNT_ID) {
    const updated = { ...existing, ...patch };
    if (enabled !== undefined) updated.enabled = enabled;
    return {
      ...cfg,
      channels: { ...cfg.channels, "timbot-ws": updated },
    };
  }

  const accounts = { ...(existing.accounts ?? {}) };
  const accountCfg = { ...(accounts[accountId] ?? {}), ...patch };
  if (enabled !== undefined) accountCfg.enabled = enabled;
  accounts[accountId] = accountCfg;
  return {
    ...cfg,
    channels: { ...cfg.channels, "timbot-ws": { ...existing, accounts } },
  };
}

export const timbotWsSetupWizard: ChannelSetupWizard = {
  channel,
  stepOrder: "text-first",
  status: createStandardChannelSetupStatus({
    channelLabel: "Tencent IM (WS)",
    configuredLabel: "configured",
    unconfiguredLabel: "needs sdkAppId + userId + userSig",
    configuredHint: "configured",
    unconfiguredHint: "needs credentials",
    configuredScore: 2,
    unconfiguredScore: 0,
    includeStatusLine: true,
    resolveConfigured: ({ cfg }) =>
      listTimbotAccountIds(cfg).some((accountId) => isTimbotWsConfigured(cfg, accountId)),
  }),
  introNote: {
    title: "Tencent IM credentials",
    lines: TIMBOT_WS_SETUP_HELP_LINES,
  },
  textInputs: [
    {
      inputKey: "sdkAppId",
      message: "SDKAppID",
      placeholder: "e.g. 1600012345",
      helpTitle: "Tencent IM SDKAppID",
      helpLines: TIMBOT_WS_SETUP_HELP_LINES,
      currentValue: ({ cfg, accountId }) => {
        const raw = getRawAccountConfig(cfg, accountId);
        return raw.sdkAppId?.trim() || undefined;
      },
      validate: ({ value }) => {
        const trimmed = String(value ?? "").trim();
        if (!trimmed) return "Required";
        if (!/^\d+$/.test(trimmed)) return "SDKAppID must be numeric";
        return undefined;
      },
      normalizeValue: ({ value }) => String(value).trim(),
      applySet: async ({ cfg, accountId, value }) =>
        patchTimbotWsAccountConfig({
          cfg,
          accountId,
          enabled: true,
          patch: { sdkAppId: value },
        }),
    },
    {
      inputKey: "userId",
      message: "UserID (bot identifier)",
      placeholder: "e.g. administrator",
      helpTitle: "Tencent IM UserID",
      helpLines: [
        "UserID is the identifier for bot login.",
        "",
        "This is the account that will send/receive messages.",
        "Common choices: administrator, bot, or any user ID in your IM app.",
        "",
        "Note: This UserID must exist in your Tencent IM application.",
      ],
      currentValue: ({ cfg, accountId }) => {
        const raw = getRawAccountConfig(cfg, accountId);
        return raw.userId?.trim() || undefined;
      },
      validate: ({ value }) => {
        const trimmed = String(value ?? "").trim();
        if (!trimmed) return "Required";
        return undefined;
      },
      normalizeValue: ({ value }) => String(value).trim(),
      applySet: async ({ cfg, accountId, value }) =>
        patchTimbotWsAccountConfig({
          cfg,
          accountId,
          enabled: true,
          patch: {
            userId: value,
            dm: getRawAccountConfig(cfg, accountId).dm ?? { policy: "open", allowFrom: ["*"] },
          },
        }),
    },
  ],
  credentials: [
    {
      inputKey: "userSig",
      providerHint: channel,
      credentialLabel: "UserSig",
      helpTitle: "Tencent IM UserSig",
      helpLines: USERSIG_HELP_LINES,
      envPrompt: "",
      keepPrompt: "UserSig already configured. Keep it?",
      inputPrompt: "Enter UserSig (recommend 10-year validity)",
      skipSecretOption: true,
      inspect: ({ cfg, accountId }) => {
        const raw = getRawAccountConfig(cfg, accountId);
        return {
          accountConfigured: isTimbotWsConfigured(cfg, accountId),
          hasConfiguredValue: Boolean(raw.userSig?.trim()),
          resolvedValue: raw.userSig ? "[configured]" : undefined,
        };
      },
      applySet: async ({ cfg, accountId, value }) =>
        patchTimbotWsAccountConfig({
          cfg,
          accountId,
          enabled: true,
          patch: { userSig: value },
        }),
    },
  ],
  disable: (cfg) => ({
    ...cfg,
    channels: {
      ...cfg.channels,
      "timbot-ws": { ...cfg.channels?.["timbot-ws"], enabled: false },
    },
  }),
};
