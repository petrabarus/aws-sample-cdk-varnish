#!/usr/bin/env bash
yum install -y nginx
chkconfig nginx on
service nginx start

cp -rf /tmp/user-data/* /usr/share/nginx/html/
