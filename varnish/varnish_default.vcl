vcl 4.0;
import std;

backend default {
    .host = "127.0.0.1";
    .port = "8080";
}

acl purge {
    "localhost";
    "127.0.0.1";
}

sub vcl_recv {

    # Purge cache requests
    if (req.method == "PURGE") {
        # Disallow purge from localhost.
        if (!client.ip ~ purge) {
            return (synth(405, "This IP is not allowed to send PURGE requests."));
        }

        # If allowed, do a cache_lookup -> vlc_hit() or vlc_miss()
        return (purge);        
    }

    # Varnish health check
    if (req.method == "GET" && req.url == "/varnish-status") {
        return (synth(200, "OK"));
    }

    # Ban existing cache
    if (req.method == "BAN") {
        # Disallow ban from localhost.
        if (!client.ip ~ purge) {
            return (synth(405, "This IP is not allowed to send BAN requests."));
        }
        # Purge if no invalidate pattern existing 
        if (!req.http.x-invalidate-pattern) {
            return (purge);
        }
        # Ban URL based on invalidate pattern
        ban("req.url ~ " + req.http.x-invalidate-pattern);
        return (synth(200, "BAN Added"));
    }
    
    # Bypass Wordpress admin and login pages
    if (req.url ~ "/wp-(login.php|admin)") {
        return (pass);
    }

    # Bypass feed
    if (req.url ~ "/feed") {
        return (pass);
    }

    # Bypass mu-*
    if (req.url ~ "/mu-*") {
        return (pass);
    }

    # Cache everything otherwise
    return (hash);
}
