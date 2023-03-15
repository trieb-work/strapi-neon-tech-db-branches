/*!
 * line-count <https://github.com/jonschlinkert/line-count>
 *
 * Copyright (c) 2014 Jon Schlinkert, contributors.
 * Licensed under the MIT License
 */

'use strict';

var assert = require('assert');
var count = require('./');

describe('count', function () {
  it('should return zero when the string is empty.', function () {
    var actual = count('');
    assert.equal(actual, 0);
  });

  it('should count lines', function () {
    var actual = count('a\nb\nc');
    assert.equal(actual, 3);
  });

  it('should include trailing newlines', function () {
    var actual = count('a\nb\nc\n');
    assert.equal(actual, 4);
  });

  it('should work with carriage returns', function () {
    var actual = count('a\r\nb\r\nc');
    assert.equal(actual, 3);
  });

  it('should include trailing carriage returns', function () {
    var actual = count('a\r\nb\r\nc\r\n');
    assert.equal(actual, 4);
  });
});