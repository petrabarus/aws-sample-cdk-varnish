#!/usr/bin/env bash
amazon-linux-extras install epel

yum install nginx -y
systemctl enable nginx.service

cp -rf /tmp/user-data/* /usr/share/nginx/html/

systemctl start nginx.service
