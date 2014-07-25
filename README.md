TechStuDIG2014-LiveCoding
=========================

The full source-code written at live-coding events for TechStuDIG 2014.

Background
----------

This is a demo application that captures video from a camcoder with [the Web Stream API](http://www.w3.org/TR/mediacapture-streams/) and displays it with [WebGL](https://www.khronos.org/registry/webgl/specs/1.0/). This application also applies a color filter and a composition filter with WebGL in drawing video frames to a <canvas> element.

Usage
-----

This demo application depends on the Stream API and WebGL. Google Chrome and Mozilla Firefox have these APIs implemented as of 25 July, 2014. These browsers enable WebGL only on devices that have all OpenGL features required by the API, i.e. browsers may raise exceptions on some older smartphones (e.g. Galaxy Nexus) in running this application on them.

The following steps describe how to run this application on your PC or on your smartphone:

0. Install one of the above browsers to your device (if it does not have it already installed), and;
1. Open [the demo page](http://denadev.github.io/TechStuDIG2014-LiveCoding/video.html) with one the the above browsers.
