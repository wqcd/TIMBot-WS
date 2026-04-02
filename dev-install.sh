#!/bin/bash
set -e

# ============================================================
# timbot-ws 开发安装脚本
# 用途: 递增 beta 版本号 → 构建 → 打包 → 卸载旧版 → 安装新版 → onboard
# ============================================================

# 加载 nvm（如果存在）
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# 确保使用 Node 22
if command -v nvm &> /dev/null; then
  nvm use 22 2>/dev/null || nvm use default
fi

TIMBOT_WS_DIR="/Users/liuchenghao/Desktop/workspace/timbot-ws"
OPENCLAW_DIR="/Users/liuchenghao/Desktop/source/openclaw"

cd "$TIMBOT_WS_DIR"

# ============================================================
# 1. 读取当前版本并递增 beta 版本号
# ============================================================

CURRENT_VERSION=$(node -p "require('./package.json').version")
echo "当前版本: $CURRENT_VERSION"

# 解析版本号：支持 x.y.z 或 x.y.z-beta.n 格式
if [[ "$CURRENT_VERSION" =~ ^([0-9]+\.[0-9]+\.[0-9]+)(-beta\.([0-9]+))?$ ]]; then
  BASE_VERSION="${BASH_REMATCH[1]}"
  BETA_NUM="${BASH_REMATCH[3]}"
  
  if [[ -z "$BETA_NUM" ]]; then
    # 当前不是 beta 版本，创建 beta.1
    NEW_VERSION="${BASE_VERSION}-beta.1"
  else
    # 递增 beta 版本号
    NEW_BETA_NUM=$((BETA_NUM + 1))
    NEW_VERSION="${BASE_VERSION}-beta.${NEW_BETA_NUM}"
  fi
else
  echo "无法解析版本号格式: $CURRENT_VERSION"
  exit 1
fi

echo "新版本: $NEW_VERSION"

# 更新 package.json 中的版本号
node -e "
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
pkg.version = '$NEW_VERSION';
fs.writeFileSync('./package.json', JSON.stringify(pkg, null, 2) + '\n');
"

echo "✅ 版本号已更新为: $NEW_VERSION"

# ============================================================
# 2. 构建项目
# ============================================================

echo ""
echo "🔨 构建项目..."
pnpm build

echo "✅ 构建完成"

# ============================================================
# 3. 打包并移动到 openclaw 目录
# ============================================================

echo ""
echo "📦 打包..."

# 删除旧的 tgz 文件
rm -f timbot-ws-*.tgz

# 打包
PACK_OUTPUT=$(pnpm pack)
PACK_FILE=$(echo "$PACK_OUTPUT" | tail -1)

echo "打包文件: $PACK_FILE"

# 移动到 openclaw 目录
rm -f "$OPENCLAW_DIR"/timbot-ws-*.tgz
mv "$PACK_FILE" "$OPENCLAW_DIR/"

echo "✅ 已移动到 $OPENCLAW_DIR/$PACK_FILE"

# ============================================================
# 4. 卸载旧版本并清理配置
# ============================================================

cd "$OPENCLAW_DIR"

echo ""
echo "🗑️  卸载旧版本..."

# 清理 openclaw.json 中的残留配置（channels.timbot-ws, plugins.entries.timbot-ws, plugins.installs.timbot-ws）
OPENCLAW_CONFIG="$HOME/.openclaw/openclaw.json"
if [ -f "$OPENCLAW_CONFIG" ]; then
  node -e "
const fs = require('fs');
const config = JSON.parse(fs.readFileSync('$OPENCLAW_CONFIG', 'utf8'));
let changed = false;

// 删除 channels.timbot-ws
if (config.channels && config.channels['timbot-ws']) {
  delete config.channels['timbot-ws'];
  changed = true;
  console.log('  - 已删除 channels.timbot-ws');
}

// 删除 plugins.entries.timbot-ws
if (config.plugins?.entries?.['timbot-ws']) {
  delete config.plugins.entries['timbot-ws'];
  changed = true;
  console.log('  - 已删除 plugins.entries.timbot-ws');
}

// 删除 plugins.installs.timbot-ws
if (config.plugins?.installs?.['timbot-ws']) {
  delete config.plugins.installs['timbot-ws'];
  changed = true;
  console.log('  - 已删除 plugins.installs.timbot-ws');
}

if (changed) {
  fs.writeFileSync('$OPENCLAW_CONFIG', JSON.stringify(config, null, 2));
  console.log('✅ 配置文件已清理');
} else {
  console.log('  配置文件无需清理');
}
"
fi

# 使用 openclaw plugins uninstall 命令（新版本支持）
node openclaw.mjs plugins uninstall timbot-ws --force 2>/dev/null || true

# 确保扩展目录也被删除
rm -rf ~/.openclaw/extensions/timbot-ws

echo "✅ 旧版本已卸载"
# ============================================================
# 5. 安装新版本
# ============================================================

echo ""
echo "📥 安装新版本..."

node openclaw.mjs plugins install "./$PACK_FILE"

echo "✅ 新版本已安装"

# ============================================================
# 6. 完成提示
# ============================================================

echo ""
echo "============================================================"
echo "✅ timbot-ws $NEW_VERSION 已安装完成！"
echo "============================================================"
echo ""
echo "📋 后续步骤："
echo "   1. 重启 gateway:  cd $OPENCLAW_DIR && node openclaw.mjs gateway restart"
echo "   2. 配置 onboard:  cd $OPENCLAW_DIR && node openclaw.mjs onboard"
echo ""
