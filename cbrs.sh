# YTDL :: Git pull -> docker [ build, remove old, start ]

# Get latest code
git pull

# Docker: build ytdl container
#docker build -t antfurn/ytdl-page-app .

# Docker: start ytdl container
#docker run -p 9980:9980 -d -v /srv/1b4e0ce9-da73-412b-bd6a-692a682543f8/Media/Downloads/ytdl:/usr/src/app/ytdl --name ytdlpage antfurn/ytdl-page-app

