#!/usr/bin/env bash

# YTDL :: Git pull -> docker [ build, remove old, start ]
echo YTDL :: Git pull -> docker [ build, remove old, start ]

# Get latest code
echo Doing:: git pull
git pull

# Docker: build ytdl container
echo Doing:: docker build
. build.sh

# Docker: stop/remove old container
echo Doing:: stop/remove old container
docker ps -a
docker stop ytdlpage2
docker rm ytdlpage2

# Docker: start ytdl container
echo Doing:: docker run
. start.sh

