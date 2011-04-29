StatsD
======

This is Tiny Speck's fork of statsd, with a bunch modifications that don't need to be merged back to trunk, but are useful to us. This includes:

* service.js wrapper
* removing the config class
* adding hostname into stat paths and making them more uniform


Installation
------------

If you really want to install this, create a wrapper script like init-prod.sh, pointing to the config file you want, then:

    ln -s /usr/local/statsd/init-prod.sh /etc/init.d/statsd
    chkconfig --add statsd
    chkconfig statsd on
    /etc/init.d/statsd start
