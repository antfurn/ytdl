@echo off
rem YTDL :: Git pull -> docker [ build, remove old, start ]
echo YTDL :: Git pull -> docker [ build, remove old, start ]

rem Get latest code
echo Doing:: git pull
git pull

rem Docker: build ytdl container
echo Doing:: docker build
docker build -t antfurn/ytdl-page-app .

rem Docker: stop/remove old container
echo Doing:: stop/remove old container
docker ps -a
docker stop ytdlpage
docker rm ytdlpage

rem Docker: start ytdl container
echo Doing:: docker run
docker run -p 9980:9980 -d -v C:\PerDev\Download:/usr/src/app/ytdl --name ytdlpage antfurn/ytdl-page-app

