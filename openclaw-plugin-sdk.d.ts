declare module "openclaw/plugin-sdk" {
  export type OpenClawPluginApi = any;
  export type OpenClawConfig = any;
  export type PluginRuntime = any;
  export type ChannelPlugin<T = any> = any;
  export type ChannelAccountSnapshot = any;
  export type ChannelConfigSchema = any;

  export type DmPolicy = "pairing" | "allowlist" | "open" | "disabled";

  export type WizardPrompter = {
    note(message: string, title?: string): Promise<void>;
    text(opts: {
      message: string;
      placeholder?: string;
      initialValue?: string;
      validate?: (value: string | undefined) => string | undefined;
    }): Promise<string>;
    confirm(opts: { message: string; initialValue?: boolean }): Promise<boolean>;
    select<T = string>(opts: {
      message: string;
      options: Array<{ value: T; label: string }>;
      initialValue?: T;
    }): Promise<T>;
  };

  export function emptyPluginConfigSchema(): any;
}

declare module "openclaw/plugin-sdk/core" {
  export const DEFAULT_ACCOUNT_ID: string;
  export function normalizeAccountId(id: string | null | undefined): string;
  export function deleteAccountFromConfigSection(params: {
    cfg: any;
    sectionKey: string;
    accountId: string;
    clearBaseFields?: string[];
    allowTopLevel?: boolean;
  }): any;
  export function formatPairingApproveHint(channel: string): string;
  export function setAccountEnabledInConfigSection(params: {
    cfg: any;
    sectionKey: string;
    accountId: string;
    enabled: boolean;
    allowTopLevel?: boolean;
  }): any;
}

declare module "openclaw/plugin-sdk/setup" {
  export type OpenClawConfig = any;

  export type ChannelSetupWizardCredentialState = {
    accountConfigured: boolean;
    hasConfiguredValue: boolean;
    resolvedValue?: string;
    envValue?: string;
  };

  export type ChannelSetupWizardCredential = {
    inputKey: string;
    providerHint: string;
    credentialLabel: string;
    preferredEnvVar?: string;
    helpTitle?: string;
    helpLines?: string[];
    envPrompt?: string;
    keepPrompt?: string;
    inputPrompt: string;
    skipSecretOption?: boolean;
    allowEnv?: (params: { cfg: any; accountId: string }) => boolean;
    inspect: (params: { cfg: any; accountId: string }) => ChannelSetupWizardCredentialState;
    shouldPrompt?: (params: {
      cfg: any;
      accountId: string;
      credentialValues: Record<string, string | undefined>;
      currentValue?: string;
      state: ChannelSetupWizardCredentialState;
    }) => boolean | Promise<boolean>;
    applyUseEnv?: (params: { cfg: any; accountId: string }) => any | Promise<any>;
    applySet?: (params: {
      cfg: any;
      accountId: string;
      credentialValues: Record<string, string | undefined>;
      value: unknown;
      resolvedValue: string;
    }) => any | Promise<any>;
  };

  export type ChannelSetupWizardTextInput = {
    inputKey: string;
    message: string;
    placeholder?: string;
    required?: boolean;
    applyEmptyValue?: boolean;
    helpTitle?: string;
    helpLines?: string[];
    confirmCurrentValue?: boolean;
    keepPrompt?: string | ((value: string) => string);
    currentValue?: (params: {
      cfg: any;
      accountId: string;
      credentialValues: Record<string, string | undefined>;
    }) => string | undefined | Promise<string | undefined>;
    initialValue?: (params: {
      cfg: any;
      accountId: string;
      credentialValues: Record<string, string | undefined>;
    }) => string | undefined | Promise<string | undefined>;
    shouldPrompt?: (params: {
      cfg: any;
      accountId: string;
      credentialValues: Record<string, string | undefined>;
      currentValue?: string;
    }) => boolean | Promise<boolean>;
    applyCurrentValue?: boolean;
    validate?: (params: {
      value: string;
      cfg: any;
      accountId: string;
      credentialValues: Record<string, string | undefined>;
    }) => string | undefined;
    normalizeValue?: (params: {
      value: string;
      cfg: any;
      accountId: string;
      credentialValues: Record<string, string | undefined>;
    }) => string;
    applySet?: (params: {
      cfg: any;
      accountId: string;
      value: string;
    }) => any | Promise<any>;
  };

  export type ChannelSetupWizardNote = {
    title: string;
    lines: string[];
    shouldShow?: (params: {
      cfg: any;
      accountId: string;
      credentialValues: Record<string, string | undefined>;
    }) => boolean | Promise<boolean>;
  };

  export type ChannelSetupWizardStatus = {
    configuredLabel: string;
    unconfiguredLabel: string;
    configuredHint?: string;
    unconfiguredHint?: string;
    configuredScore?: number;
    unconfiguredScore?: number;
    includeStatusLine?: boolean;
    resolveConfigured: (params: { cfg: any }) => boolean | Promise<boolean>;
    resolveStatusLines?: (params: { cfg: any; configured: boolean }) => string[] | Promise<string[]>;
    resolveExtraStatusLines?: (params: { cfg: any }) => string[] | Promise<string[]>;
    resolveQuickstartScore?: (params: { cfg: any; configured: boolean }) => number | undefined | Promise<number | undefined>;
  };

  export type ChannelSetupWizard = {
    channel: string;
    stepOrder?: "credentials-first" | "text-first";
    status: ChannelSetupWizardStatus;
    introNote?: ChannelSetupWizardNote;
    credentials: ChannelSetupWizardCredential[];
    textInputs?: ChannelSetupWizardTextInput[];
    prepare?: (...args: any[]) => any;
    finalize?: (...args: any[]) => any;
    completionNote?: ChannelSetupWizardNote;
    dmPolicy?: any;
    allowFrom?: any;
    groupAccess?: any;
    disable?: (cfg: any) => any;
    onAccountRecorded?: (...args: any[]) => any;
  };

  export type ChannelSetupAdapter = any;

  export const DEFAULT_ACCOUNT_ID: string;
  export function normalizeAccountId(id: string | null | undefined): string;
  export function addWildcardAllowFrom(allowFrom?: any): any;
  export function formatDocsLink(path: string, label: string): string;
  export function createStandardChannelSetupStatus(params: {
    channelLabel: string;
    configuredLabel: string;
    unconfiguredLabel: string;
    configuredHint?: string;
    unconfiguredHint?: string;
    configuredScore?: number;
    unconfiguredScore?: number;
    includeStatusLine?: boolean;
    resolveConfigured: (params: { cfg: any }) => boolean | Promise<boolean>;
    resolveStatusLines?: (params: { cfg: any; configured: boolean }) => string[] | Promise<string[]>;
    resolveExtraStatusLines?: (params: { cfg: any }) => string[] | Promise<string[]>;
    resolveQuickstartScore?: (params: { cfg: any; configured: boolean }) => number | undefined | Promise<number | undefined>;
  }): ChannelSetupWizardStatus;
  export function setSetupChannelEnabled(cfg: any, channel: string, enabled: boolean): any;
  export function patchChannelConfigForAccount(params: {
    cfg: any;
    channel: string;
    accountId: string;
    patch: Record<string, unknown>;
  }): any;
  export function splitSetupEntries(params: {
    cfg: any;
    channel: string;
  }): any;
}
