#!/usr/bin/env python3
"""
TIMBot-WS (FIM 定制版) 安装脚本

支持通过远端登录接口获取 UserSig，无需手动生成静态签名。

用法:
    python install.py                          # 交互式安装
    python install.py --skip-build              # 跳过编译，仅配置
    python install.py --uninstall               # 卸载插件并清理配置
    python install.py --sig-endpoint URL        # 指定登录接口地址
    python install.py --sig-username USER       # 指定登录账号
    python install.py --sig-password PASS       # 指定登录密码
    python install.py --sdk-app-id ID           # 指定腾讯 IM SDKAppID
    python install.py --user-id ID              # 指定机器人 UserID
"""

import json
import os
import subprocess
import sys
import time
import shutil
import argparse
import tempfile
from pathlib import Path

# ========== 配置 ==========

PLUGIN_ID = "timbot-ws"
PLUGIN_REPO = "https://github.com/wqcd/TIMBot-WS.git"
NPM_PACKAGE = "timbot-ws@2026.4.7-beta.1"

# 路径（自动检测平台）
if sys.platform == "win32":
    OPENCLAW_HOME = Path.home() / ".openclaw"
else:
    OPENCLAW_HOME = Path.home() / ".openclaw"

OPENCLAW_CONFIG = OPENCLAW_HOME / "openclaw.json"
EXTENSION_DIR = OPENCLAW_HOME / "extensions" / PLUGIN_ID

# 脚本所在目录（即项目根目录）
SCRIPT_DIR = Path(__file__).resolve().parent
PACKAGE_JSON = SCRIPT_DIR / "package.json"


# ========== 工具函数 ==========

def get_version():
    """读取当前版本号"""
    if PACKAGE_JSON.exists():
        with open(PACKAGE_JSON, "r", encoding="utf-8") as f:
            pkg = json.load(f)
            return pkg.get("version", "unknown")
    return "unknown"


def run(cmd: list, check: bool = True, cwd: str = None) -> subprocess.CompletedProcess:
    """运行命令"""
    print(f"  > {' '.join(str(c) for c in cmd)}")
    return subprocess.run(cmd, capture_output=True, text=True, check=check, cwd=cwd)


def step(msg: str):
    print(f"\n{msg}")
    print("-" * 50)


def prompt_input(label: str, default: str = None, required: bool = True) -> str:
    """交互式输入"""
    hint = f"  {label}"
    if default:
        hint += f" [{default}]: "
    else:
        hint += ": "
    value = input(hint).strip()
    if not value and default:
        return default
    if not value and required:
        print(f"  ❌ {label} 不能为空")
        return prompt_input(label, default, required)
    return value


def prompt_yes_no(label: str, default: bool = True) -> bool:
    """交互式是/否"""
    hint = f"  {label} [{'Y/n' if default else 'y/N'}]: "
    value = input(hint).strip().lower()
    if not value:
        return default
    return value in ("y", "yes", "是")


# ========== 配置操作 ==========

def load_config() -> dict:
    """加载 OpenClaw 配置"""
    if OPENCLAW_CONFIG.exists():
        with open(OPENCLAW_CONFIG, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


def save_config(config: dict):
    """保存 OpenClaw 配置"""
    OPENCLAW_HOME.mkdir(parents=True, exist_ok=True)
    with open(OPENCLAW_CONFIG, "w", encoding="utf-8") as f:
        json.dump(config, f, indent=2, ensure_ascii=False)


def clean_plugin_config(config: dict) -> dict:
    """清理配置中的 timbot-ws 引用"""
    # 移除 channels.timbot-ws
    if "channels" in config and PLUGIN_ID in config["channels"]:
        del config["channels"][PLUGIN_ID]

    # 移除 bindings 中的 timbot-ws
    if "bindings" in config:
        config["bindings"] = [
            b for b in config["bindings"]
            if b.get("match", {}).get("channel") != PLUGIN_ID
        ]

    # 移除 plugins 中的 timbot-ws
    if "plugins" in config:
        if "allow" in config["plugins"] and PLUGIN_ID in config["plugins"]["allow"]:
            config["plugins"]["allow"].remove(PLUGIN_ID)
        if "entries" in config["plugins"] and PLUGIN_ID in config["plugins"]["entries"]:
            del config["plugins"]["entries"][PLUGIN_ID]
        if "installs" in config["plugins"] and PLUGIN_ID in config["plugins"]["installs"]:
            del config["plugins"]["installs"][PLUGIN_ID]

    return config


def add_plugin_config(config: dict, sdk_app_id: str, user_id: str,
                      sig_endpoint: str = None, sig_username: str = None,
                      sig_password: str = None, user_sig: str = None) -> dict:
    """添加 timbot-ws 配置"""

    # 构建 channel 配置
    channel_config = {
        "enabled": True,
        "sdkAppId": sdk_app_id,
        "userId": user_id,
    }

    # 优先使用远端登录，其次使用静态 userSig
    if sig_endpoint:
        channel_config["sigEndpoint"] = sig_endpoint
        if sig_username:
            channel_config["sigUsername"] = sig_username
        if sig_password:
            channel_config["sigPassword"] = sig_password
    elif user_sig:
        channel_config["userSig"] = user_sig

    # 添加 channels
    if "channels" not in config:
        config["channels"] = {}
    config["channels"][PLUGIN_ID] = channel_config

    # 添加 binding
    if "bindings" not in config:
        config["bindings"] = []
    binding = {"agentId": "main", "match": {"channel": PLUGIN_ID, "accountId": "default"}}
    existing = [b for b in config["bindings"]
                if b.get("match", {}).get("channel") == PLUGIN_ID]
    if not existing:
        config["bindings"].append(binding)

    # 添加 plugins
    if "plugins" not in config:
        config["plugins"] = {}
    if "allow" not in config["plugins"]:
        config["plugins"]["allow"] = []
    if PLUGIN_ID not in config["plugins"]["allow"]:
        config["plugins"]["allow"].append(PLUGIN_ID)
    if "entries" not in config["plugins"]:
        config["plugins"]["entries"] = {}
    config["plugins"]["entries"][PLUGIN_ID] = {"enabled": True}

    return config


# ========== 构建步骤 ==========

def step_install_deps():
    """安装依赖"""
    step("[1/6] 安装依赖...")
    run(["npm", "install"], cwd=str(SCRIPT_DIR))
    print("  OK 依赖安装完成")


def step_extract_sdk_bundle():
    """从 npm 包提取 im-node-sdk-dist（Node.js IM SDK）"""
    step("[2/6] 提取 IM SDK (im-node-sdk-dist)...")

    im_node_sdk_dir = SCRIPT_DIR / "im-node-sdk-dist"
    if im_node_sdk_dir.exists() and (im_node_sdk_dir / "node.es.js").exists():
        print("  OK im-node-sdk-dist 已存在，跳过")
        return

    print("  从 npm 包提取 node.es.js...")
    tmp_dir = Path(tempfile.mkdtemp(prefix="timbot-ws-"))
    try:
        # 下载 npm 包
        run(["npm", "pack", NPM_PACKAGE], cwd=str(tmp_dir))
        tgz_files = list(tmp_dir.glob("timbot-ws-*.tgz"))
        if not tgz_files:
            print("  ERROR npm pack 未生成 tgz 文件")
            sys.exit(1)

        # 解压
        import tarfile
        with tarfile.open(str(tgz_files[0]), "r:gz") as tar:
            tar.extractall(path=str(tmp_dir))

        # 拷贝 im-sdk-bundle -> im-node-sdk-dist
        bundle_src = tmp_dir / "package" / "dist" / "im-sdk-bundle"
        if not bundle_src.exists():
            print(f"  ERROR npm 包中没有 dist/im-sdk-bundle")
            sys.exit(1)

        im_node_sdk_dir.mkdir(parents=True, exist_ok=True)
        for f in bundle_src.iterdir():
            shutil.copy2(str(f), str(im_node_sdk_dir / f.name))

        print(f"  OK 已提取 {len(list(im_node_sdk_dir.iterdir()))} 个文件到 im-node-sdk-dist/")
    finally:
        shutil.rmtree(str(tmp_dir), ignore_errors=True)


def step_build():
    """编译 TypeScript"""
    step("[3/6] 编译插件...")
    result = run(["npm", "run", "build"], check=False, cwd=str(SCRIPT_DIR))
    if result.returncode != 0:
        print(f"  ERROR 编译失败:")
        print(result.stderr)
        sys.exit(1)

    # 检查关键文件
    node_es = SCRIPT_DIR / "dist" / "im-sdk-bundle" / "node.es.js"
    index_js = SCRIPT_DIR / "dist" / "index.js"
    if not node_es.exists():
        print("  ERROR dist/im-sdk-bundle/node.es.js 不存在")
        sys.exit(1)
    if not index_js.exists():
        print("  ERROR dist/index.js 不存在")
        sys.exit(1)

    print("  OK 编译完成")


def step_install_plugin():
    """安装插件到 OpenClaw"""
    step("[4/7] 安装插件到 OpenClaw...")

    # 清理旧扩展
    if EXTENSION_DIR.exists():
        shutil.rmtree(EXTENSION_DIR)
        print("  OK 旧扩展已清理")

    # 先尝试 openclaw plugins install（官方方式），60秒超时
    print("  正在安装 (openclaw plugins install)...")
    try:
        proc = subprocess.Popen(
            ["openclaw", "plugins", "install", "-l", str(SCRIPT_DIR)],
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True
        )
        try:
            stdout, _ = proc.communicate(timeout=60)
            if proc.returncode == 0 or "Linked plugin path" in (stdout or ""):
                print("  OK 插件已安装 (openclaw plugins install)")
                # 修复 node.es.js 的 type: module warning
                _fix_sdk_bundle_package_json()
                return
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait()
            # 超时不一定失败，检查是否已安装
            if EXTENSION_DIR.exists() or (SCRIPT_DIR / "dist" / "index.js").exists():
                print("  OK 插件已安装 (openclaw plugins install, 超时但安装成功)")
                _fix_sdk_bundle_package_json()
                return
            print("  WARN openclaw plugins install 超时，使用手动拷贝...")
    except FileNotFoundError:
        print("  WARN openclaw 命令未找到，使用手动拷贝...")

    # fallback: 手动拷贝
    EXTENSION_DIR.mkdir(parents=True, exist_ok=True)
    for item in ["dist", "package.json", "openclaw.plugin.json"]:
        src = SCRIPT_DIR / item
        if src.is_dir():
            shutil.copytree(str(src), str(EXTENSION_DIR / item), dirs_exist_ok=True)
        elif src.exists():
            shutil.copy2(str(src), str(EXTENSION_DIR / item))
    _fix_sdk_bundle_package_json()
    print("  OK 插件已安装 (手动拷贝模式)")


def _fix_sdk_bundle_package_json():
    """修复 im-sdk-bundle 的 package.json，消除 Node.js type warning"""
    # 项目内 dist
    bundle_pkg = SCRIPT_DIR / "dist" / "im-sdk-bundle" / "package.json"
    bundle_dir = SCRIPT_DIR / "dist" / "im-sdk-bundle"
    if bundle_dir.exists() and not bundle_pkg.exists():
        with open(bundle_pkg, "w", encoding="utf-8") as f:
            json.dump({"type": "module"}, f)

    # 扩展目录
    ext_pkg = EXTENSION_DIR / "dist" / "im-sdk-bundle" / "package.json"
    ext_dir = EXTENSION_DIR / "dist" / "im-sdk-bundle"
    if ext_dir.exists() and not ext_pkg.exists():
        with open(ext_pkg, "w", encoding="utf-8") as f:
            json.dump({"type": "module"}, f)


def login_for_user_id(sig_endpoint: str, sig_username: str, sig_password: str) -> str:
    """调用登录接口获取 user_id"""
    import urllib.request
    import urllib.error

    url = sig_endpoint
    body = json.dumps({"username": sig_username, "password": sig_password}).encode("utf-8")
    req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"})

    print(f"  > POST {url}")
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        print(f"  ERROR 登录接口返回 HTTP {e.code}")
        sys.exit(1)
    except Exception as e:
        print(f"  ERROR 登录接口连接失败: {e}")
        sys.exit(1)

    if data.get("code", -1) != 0:
        print(f"  ERROR 登录失败: code={data.get('code')}, message={data.get('message', '')}")
        sys.exit(1)

    results = data.get("results") or data.get("data") or {}
    user_id = results.get("user_id") or results.get("userId") or results.get("user_id")
    sig = results.get("sig") or results.get("userSig")

    if user_id:
        print(f"  OK 登录成功, user_id={user_id}")
    else:
        print(f"  WARN 登录成功但未返回 user_id (响应: {json.dumps(data)[:200]})")

    if sig:
        print(f"  OK sig 获取成功 (length={len(sig)})")

    return user_id


def step_configure(args):
    """配置 channels"""
    step("[5/6] 配置 channels...")

    config = load_config()
    config = clean_plugin_config(config)

    # 获取配置参数（命令行 > 交互式）
    sdk_app_id = args.sdk_app_id or prompt_input("腾讯 IM SDKAppID")

    use_remote = True
    if not args.sig_endpoint:
        use_remote = prompt_yes_no("使用远端登录接口获取 UserSig？（推荐）", default=True)

    sig_endpoint = None
    sig_username = None
    sig_password = None
    user_sig = None
    user_id = args.user_id or None

    if use_remote or args.sig_endpoint:
        sig_endpoint = args.sig_endpoint or prompt_input("登录接口地址 (如 http://192.168.1.100:8080/login/password)")
        sig_username = args.sig_username or prompt_input("登录账号")
        sig_password = args.sig_password or prompt_input("登录密码")

        # 自动从登录接口获取 user_id
        if not user_id:
            print("\n  正在通过登录接口获取 user_id...")
            user_id = login_for_user_id(sig_endpoint, sig_username, sig_password) or None

        # 如果登录接口没返回 user_id，再手动问
        if not user_id:
            user_id = prompt_input("机器人 UserID（登录接口未返回，需手动填写）")
    else:
        user_sig = prompt_input("静态 UserSig（建议有效期 10 年）")
        user_id = user_id or prompt_input("机器人 UserID", default="administrator")

    config = add_plugin_config(
        config,
        sdk_app_id=sdk_app_id,
        user_id=user_id,
        sig_endpoint=sig_endpoint,
        sig_username=sig_username,
        sig_password=sig_password,
        user_sig=user_sig,
    )

    save_config(config)
    print("  OK 配置已写入 " + str(OPENCLAW_CONFIG))


def step_stop_gateway():
    """停止 Gateway"""
    step("[5.1] 停止 Gateway...")
    run(["openclaw", "gateway", "stop"], check=False)
    time.sleep(2)
    print("  OK Gateway 已停止")


def step_restart_gateway():
    """重启 Gateway"""
    step("[6/6] 启动 Gateway...")
    result = run(["openclaw", "gateway", "restart"], check=False)
    if result.returncode != 0:
        print("  WARN 自动重启失败，请手动执行:")
        print("    openclaw gateway run --verbose --force")
    else:
        print("  OK Gateway 已重启")
        time.sleep(3)


# ========== 主流程 ==========

def do_install(args):
    print("=" * 50)
    print(f"  TIMBot-WS (FIM 定制版) v{get_version()}")
    print("=" * 50)

    if not args.skip_build:
        step_install_deps()
        step_extract_sdk_bundle()
        step_build()

    step_install_plugin()
    step_stop_gateway()
    step_configure(args)
    step_restart_gateway()

    # 验证
    print("\n" + "=" * 50)
    print("  安装完成!")
    print("=" * 50)
    print(f"""
  插件版本: {get_version()}
  配置文件: {OPENCLAW_CONFIG}
  扩展目录: {EXTENSION_DIR}

  常用命令:
    openclaw gateway run --verbose --force   # 前台运行查看日志
    openclaw config edit                     # 编辑配置
    openclaw gateway restart                 # 重启服务
""")


def do_uninstall(_args):
    print("=" * 50)
    print("  卸载 TIMBot-WS 插件")
    print("=" * 50)

    # 清理配置
    config = load_config()
    config = clean_plugin_config(config)
    save_config(config)
    print("  OK 配置已清理")

    # 删除扩展
    if EXTENSION_DIR.exists():
        shutil.rmtree(EXTENSION_DIR)
        print("  OK 扩展已删除")

    # 重启
    run(["openclaw", "gateway", "restart"], check=False)
    print("  OK Gateway 已重启")
    print("\n  卸载完成!")


def main():
    parser = argparse.ArgumentParser(description="TIMBot-WS (FIM 定制版) 安装脚本")
    parser.add_argument("--skip-build", action="store_true", help="跳过编译，仅配置和安装")
    parser.add_argument("--uninstall", action="store_true", help="卸载插件并清理配置")

    # 配置参数
    parser.add_argument("--sdk-app-id", help="腾讯 IM SDKAppID")
    parser.add_argument("--user-id", help="机器人 UserID")
    parser.add_argument("--sig-endpoint", help="远端登录接口地址 (如 http://host:port/login/password)")
    parser.add_argument("--sig-username", help="远端登录账号")
    parser.add_argument("--sig-password", help="远端登录密码")
    parser.add_argument("--user-sig", help="静态 UserSig（不使用远端登录时）")

    args = parser.parse_args()

    if args.uninstall:
        do_uninstall(args)
    else:
        do_install(args)


if __name__ == "__main__":
    main()
