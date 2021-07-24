#!/usr/bin/env bash
amazon-linux-extras install epel

yum install varnish -y
yum install nginx -y

systemctl enable varnish.service
systemctl enable nginx.service

sed -i 's/VARNISH_LISTEN_PORT=6081/VARNISH_LISTEN_PORT=80/' /etc/varnish/varnish.params
mv /tmp/user-data/varnish_default.vcl /etc/varnish/default.vcl
mv /tmp/user-data/nginx.conf /etc/nginx/nginx.conf

systemctl start varnish.service
systemctl start nginx.service
