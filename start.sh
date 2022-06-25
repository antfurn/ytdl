#!/usr/bin/env bash

docker run -p 9980:9980 -d -v /srv/mergerfs/FastPool/Media/Downloads/ytdl:/usr/src/app/ytdl -v /etc/localtime:/etc/localtime:ro --name ytdlpage antfurn/ytdl-page-app