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

    # Bypass no-cache
    if (req.url ~ "/no-cache.html") {
        return (pass);
    }

    # Cache everything otherwise
    return (hash);
}
