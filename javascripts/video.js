/**


The MIT License (MIT)  
Copyright (c) 2014 DeNA Co., Ltd.


Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:


The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.


THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NON INFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.


**/

/** @namespace */
var dena = {};

/**
 * Represents whether this file is compiled with the Closure Compiler.
 * @define {boolean}
 */
dena.COMPILED = false;

/**
 * An application written at the live-coding demo for TechStuDIG 2014.
 * @constructor
 */
dena.Application = function() {
  /**
   * An HTMLVideoElement object that draws video captured with the WebRTC API.
   * @const {HTMLVideoElement}
   * @private
   */
  this.video_ =
      /** @type {HTMLVideoElement} */ (document.getElementById('input'));

  /**
   * An HTMLCanvasElement object that draws filtered images.
   * @const {HTMLCanvasElement}
   * @private
   */
  this.canvas_ =
      /** @type {HTMLCanvasElement} */ (document.getElementById('output'));

  /**
   * An WebGLRenderingContext interface used for applying filters to images.
   * @type {WebGLRenderingContext}
   * @private
   */
  this.context_ = /** @type {WebGLRenderingContext} */ (
      this.canvas_.getContext('experimental-webgl'));


  /**
   * An HTMLCanvasElement object that draws filtered images.
   * @const {HTMLSelectElement}
   * @private
   */
  this.compositeFilter_ =
      /** @type {HTMLSelectElement} */ (document.getElementById('composition'));

  /**
   * An HTMLCanvasElement object that draws filtered images.
   * @const {HTMLSelectElement}
   * @private
   */
  this.colorFilter_ =
      /** @type {HTMLSelectElement} */ (document.getElementById('color'));

  /**
   * A callback function for the RequestAnimationFrame API.
   * @const {Function}
   * @private
   */
  this.handleAnimationFrame_ = this.updateFrame_.bind(this);

  /**
   * A texture bitmap that copies frames of the captured video.
   * @type {WebGLTexture}
   * @private
   */
  this.texture_ = null;

  /**
   * A reference to the 'kernel' array used in a shader program.
   * @type {WebGLUniformLocation}
   * @private
   */
  this.kernel_ = null;

  /**
   * A reference to the 'color' array used in a shader program.
   * @type {WebGLUniformLocation}
   * @private
   */
  this.color_ = null;
};

/**
 * The matrices of composition filters.
 * @const {Object.<string,Float32Array>}
 * @private
 */
dena.Application.COMPOSITION_ = {
  'none': new Float32Array([
    0, 0, 0,
    0, 1, 0,
    0, 0, 0
  ]),
  'box': new Float32Array([
    1 / 9, 1 / 9, 1 / 9,
    1 / 9, 1 / 9, 1 / 9,
    1 / 9, 1 / 9, 1 / 9
  ]),
  'gaussian': new Float32Array([
    1 / 16, 2 / 16, 1 / 16,
    2 / 16, 4 / 16, 2 / 16,
    1 / 16, 2 / 16, 1 / 16
  ]),
  'emboss': new Float32Array([
    2, -1, 0,
    0, -1, 0,
    0, 0, -1
  ]),
  'sharpness': new Float32Array([
    -1, -1, -1,
    -1, 9, -1,
    -1, -1, -1
  ]),
  'laplacian': new Float32Array([
    0, 1, 0,
    1, -4, 1,
    0, 1, 0
  ])
};

/**
 * The matrices of color filters.
 * @const {Object.<string,Float32Array>}
 * @private
 */
dena.Application.COLOR_ = {
  'none': new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1
  ]),
  'bgra': new Float32Array([
    0, 0, 1, 0,
    0, 1, 0, 0,
    1, 0, 0, 0,
    0, 0, 0, 1
  ]),
  'sepia': new Float32Array([
    0.14, 0.12, 0.08, 0,
    0.45, 0.39, 0.28, 0,
    0.05, 0.04, 0.03, 0,
    0, 0, 0, 1
  ]),
  'monochrome': new Float32Array([
    0.299, 0.299, 0.299, 0,
    0.587, 0.587, 0.587, 0,
    0.114, 0.114, 0.114, 0,
    0, 0, 0, 1
  ])
};

/**
 * The global instance of the demo application.
 * @type {dena.Application} 
 * @private
 */
dena.Application.instance_ = null;

/**
 * Returns the instance of the demo application.
 * @return {dena.Application}
 */
dena.Application.getInstance = function() {
  if (!dena.Application.instance_) {
    dena.Application.instance_ = new dena.Application();
  }
  return dena.Application.instance_;
};

/**
 * Called when a user allows capturing video with the WebRTC API.
 * @param {Object} stream
 * @private
 */
dena.Application.prototype.handleCaptureSuccess_ = function(stream) {
  if (!stream) {
    throw new Error('This browser does not provide a media stream.');
  }

  // Draws the captured video to the HTMLVideoElement object.
  var width = this.video_.width;
  var height = this.video_.height;
  this.video_.src = window.URL.createObjectURL(stream);

  // Retrieve the output canvas and its WebGLRenderingContext interface.
  /// <var type="WebGLRenderingContext" name="context"/>
  var context = this.context_;
  if (!context) {
    throw new Error('This browser does not support the WebGL API.');
  }

  // Create a shader program that applies a couple of filters (a composition
  // filter and a color filter) and draws its output.
  var VERTEX =
      'attribute vec2 position;' +
      'attribute vec2 texture;' +
      'varying vec2 uvPoint;' +
      'void main() {' +
        'gl_Position = ' +
            'vec4(2.0 * position[0] - 1.0, -2.0 * position[1] + 1.0, 0, 1);' +
        'uvPoint = texture;' +
       '}';
  var vertexShader = context.createShader(context.VERTEX_SHADER);
  context.shaderSource(vertexShader, VERTEX);
  context.compileShader(vertexShader);
  if (!context.getShaderParameter(vertexShader, context.COMPILE_STATUS)) {
    throw new Error('ERROR: ' + context.getShaderInfoLog(vertexShader));
  }

  var FRAGMENT =
      'precision mediump float;' +
      'varying vec2 uvPoint;' +
      'uniform sampler2D image;' +
      'uniform vec2 offset[9];' +
      'uniform float kernel[9];' +
      'uniform mat4 color;' +
      'void main() {' +
        'vec4 sum = vec4(0.0, 0.0, 0.0, 0.0);' +
        'for (int i = 0; i < 9; ++i) {' +
          'sum += kernel[i] * texture2D(image, uvPoint + offset[i]);' +
        '}' +
        'gl_FragColor = color * sum;' +
      '}';
  var fragmentShader = context.createShader(context.FRAGMENT_SHADER);
  context.shaderSource(fragmentShader, FRAGMENT);
  context.compileShader(fragmentShader);
  if (!context.getShaderParameter(fragmentShader, context.COMPILE_STATUS)) {
    throw new Error('ERROR: ' + context.getShaderInfoLog(fragmentShader));
  }

  var program = context.createProgram();
  context.attachShader(program, vertexShader);
  context.attachShader(program, fragmentShader);
  context.linkProgram(program);
  context.useProgram(program);

  // Bind the attributes ('position' and 'texture') used in the vertex shader to
  // JavaScript variables and set their values. This codes split the rectangle
  // of the input video into a couple of triangles (p0,p1,p2) and (p1,p2,p3)
  // listed below so we can treat them as a triangle strip. (This application
  // does not change the values and they should be set only at this time.)
  //   p0 +--+ p1
  //      | /|
  //      |/ |
  //   p2 +--+ p3
  var positionBuffer = context.createBuffer();
  context.bindBuffer(context.ARRAY_BUFFER, positionBuffer);
  context.bufferData(context.ARRAY_BUFFER,
                     new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]),
                     context.STATIC_DRAW);
  var positionLocation = context.getAttribLocation(program, 'position');
  context.enableVertexAttribArray(positionLocation);
  context.vertexAttribPointer(positionLocation, 2, context.FLOAT, false, 0, 0);

  var textureBuffer = context.createBuffer();
  context.bindBuffer(context.ARRAY_BUFFER, textureBuffer);
  context.bufferData(context.ARRAY_BUFFER,
                     new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]),
                     context.STATIC_DRAW);
  var textureLocation = context.getAttribLocation(program, 'texture');
  context.enableVertexAttribArray(textureLocation);
  context.vertexAttribPointer(textureLocation, 2, context.FLOAT, false, 0, 0);

  // Bind the texture used in the fragment shader and set its parameters.
  var texture = context.createTexture();
  context.bindTexture(context.TEXTURE_2D, texture);
  context.texParameteri(context.TEXTURE_2D,
                        context.TEXTURE_WRAP_S,
                        context.CLAMP_TO_EDGE);
  context.texParameteri(context.TEXTURE_2D,
                        context.TEXTURE_WRAP_T,
                        context.CLAMP_TO_EDGE);
  context.texParameteri(context.TEXTURE_2D,
                        context.TEXTURE_MIN_FILTER,
                        context.LINEAR);
  context.texParameteri(context.TEXTURE_2D,
                        context.TEXTURE_MAG_FILTER,
                        context.LINEAR);

  // Bind the uniform array 'offset' (used for retrieving pixels around a
  // position) to a JavaScript variable and set its values. This application
  // reads nine pixels listed below and writes a composite pixel.
  //   north west   north  north east
  //              \   |    /
  //         west - center - east
  //              /   |    \
  //   south west   south   south east
  var stepWidth = 1 / width;
  var stepHeight = 1 / height;
  var offsets = context.getUniformLocation(program, 'offset');
  context.uniform2fv(offsets, new Float32Array([
    -stepWidth, -stepHeight,  // north west
    0, -stepHeight,           // north
    stepWidth, -stepHeight,   // north east
    -stepWidth, 0,            // west
    0, 0,                     // center
    stepWidth, 0,             // east
    -stepWidth, stepHeight,   // south west
    0, stepHeight,            // south
    stepWidth, stepHeight     // south east
  ]));

  // Bind a couple of uniform arrays ('kernel' and 'color') used in the fragment
  // shader and set their initial values.
  this.kernel_ = context.getUniformLocation(program, 'kernel');
  context.uniform1fv(
      this.kernel_,
      dena.Application.COMPOSITION_[this.compositeFilter_.value]);

  this.color_ = context.getUniformLocation(program, 'color');
  context.uniformMatrix4fv(
      this.color_,
      false,
      dena.Application.COLOR_[this.colorFilter_.value]);

  // Attach a function to update an animation on the output canvas.
  window.requestAnimationFrame(
      /** @type {function(number)} */ (this.handleAnimationFrame_));
};

/**
 * Called when a browser does not have capture devices available for the WebRTC
 * API or when a user does not allow using them.
 * @param {Error} error
 * @private
 */
dena.Application.prototype.handleCaptureError_ = function(error) {
  throw new Error(error.name + ',' + error.message);
};

/**
 * Called when a browser updates a frame.
 * @param {number} timestamp
 * @private
 */
dena.Application.prototype.updateFrame_ = function(timestamp) {
  /// <var type="WebGLRenderingContext" name="context"/>
  var context = this.context_;

  // Update the values of the uniform arrays to reflect the ones of the <select>
  // elements.
  context.uniform1fv(
      this.kernel_,
      dena.Application.COMPOSITION_[this.compositeFilter_.value]);
  context.uniformMatrix4fv(
      this.color_,
      false,
      dena.Application.COLOR_[this.colorFilter_.value]);

  // Read the current frame in the input <video> element and copy it to the
  // output canvas.
  context.texImage2D(context.TEXTURE_2D,
                     0,
                     context.RGBA,
                     context.RGBA,
                     context.UNSIGNED_BYTE,
                     this.video_);
  context.drawArrays(context.TRIANGLE_STRIP, 0, 4);

  window.requestAnimationFrame(
      /** @type {function(number)} */(this.handleAnimationFrame_));
};

/**
 * Starts this application.
 */
dena.Application.prototype.start = function() {
  // Overwrite the getUserMedia() method with prefixed one for old browsers.
  navigator['getUserMedia'] = navigator['getUserMedia'] ||
                              navigator['webkitGetUserMedia'] ||
                              navigator['mozGetUserMedia'];
  if (!navigator['getUserMedia']) {
    throw new Error('This browser does not support the WebRTC API.');
  }

  // Start capturing video from a video capture device.
  navigator['getUserMedia'](
      { 'video': true },
      this.handleCaptureSuccess_.bind(this),
      this.handleCaptureError_.bind(this));
};

/**
 * Called when a browser finishes loading this page. This method is the
 * entry-point function of this application.
 */
window.onload = function() {
  // Detach this method from the window.onload property. (This line is not only
  // for stop listening more load events but also for allowing JavaScript
  // engines to delete this method and all its resources.)
  window.onload = null;
  dena.Application.getInstance().start();
};
