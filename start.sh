#!/usr/bin/env bash

docker run -p 9980:9980 -d -v /srv/1b4e0ce9-da73-412b-bd6a-692a682543f8/Media/Downloads/ytdl:/usr/src/app/ytdl -v /etc/localtime:/etc/localtime:ro --name ytdlpage antfurn/ytdl-page-app