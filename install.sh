#!/bin/bash

# ConfSync Satellite Auto-Installer
# https://github.com/jhuckaby/confsync-satellite
# Copyright (c) 2023 Joseph Huckaby
# MIT License

OS=$(uname)
ARCH=$(uname -m)
URL=""

if [[ "$OS" == "Linux" ]]; then
	OS="linux"
elif [[ "$OS" == "Darwin" ]]; then
	OS="macos"
else
	echo "Unknown operating system: $OS" >&2
	exit 1
fi

if [[ "$ARCH" == "x86_64" ]]; then
	ARCH="x64"
elif [[ "$ARCH" == "arm64" ]]; then
	ARCH="arm64"
else
	echo "Unknown architecture: $ARCH" >&2
	exit 1
fi

URL="https://github.com/jhuckaby/confsync-satellite/releases/latest/download/confsync-satellite-$OS-$ARCH"
echo "Downloading: $URL"

mkdir -p /opt/confsync || exit 1;
cd /opt/confsync || exit 1;
curl -L -o /opt/confsync/satellite.bin "$URL" || exit 1;
chmod 755 /opt/confsync/satellite.bin || exit 1;
/opt/confsync/satellite.bin --install || exit 1;
