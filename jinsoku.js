var Path = require('path');
var Fs   = require('fs');

var Async = require('async');
var $     = require('cheerio');

var root = Path.dirname(process.mainModule.filename) + Path.sep;

function merge() {
  var options, name, source, copy, copy_array, clone;
  var target = arguments[0] || {};
  var length = arguments.length;
  var deep   = true;
  var i = 1;

  if (typeof(target) === 'boolean') {
    depp = target;
    target = arguments[1] || {};
    i = 2;
  }

  if (typeof(target) !== 'object' && typeof(target) !== 'function') {
    target = {};
  }

  for (; i<length; i++) {
    if ((options = arguments[i]) != null) {
      for (name in options) {
        source = target[name];
        copy   = options[name];

        if (target === copy) { continue; }

        copy_array = copy instanceof Array;

        if (deep && copy && (typeof(copy)==='object' || copy_array)) {
          if (copy_array) {
            copy_array = false;
            clone = source && typeof(source)==='array' ? source : [];
          } else {
            clone = source && typeof(source)==='object' ? source : {};
          }

          target[name] = merge(deep, clone, copy);
        } else if (copy !== undefined) {
          target[name] = copy;
        }
      }
    }
  }

  return target;
}

var Jinsoku = {
  templates: {},
  cache: {},
  parsers: [],

  options: {
    path: root +'views'+ Path.sep,
    dataname: 'data',
    extract: true,
    cache: true,
    extension: '.html'
  },

  set: function(key, value) {
    if (typeof(key) === 'object') {
      return this.options = merge(this.options, key);
    }

    this.options[key] = value;
  },

  resolve: function(path) {
    return this.options.path + path.replace('.', '/') + this.options.extension;
  },

  template: function(path, callback) {
    var self = this;

    path = self.resolve(path);

    if (self.options.cache && self.templates[path]) {
      return callback(null, self.templates[path]);
    }

    Fs.readFile(path, 'utf-8', function(error, content) {
      if (error) { return callback(error); }

      content = content.replace(/\[include:\s*([^\]]+)\s*\]/g, function(match, partial) {
        return '<js include="'+ partial +'"></js>';
      });

      content = $.load(content);

      if (self.options.cache) {
        self.templates[path] = content;
      }

      callback(null, content);
    });
  },

  render: function(path, data, callback) {
    var self = this;

    if (typeof(data) === 'function') {
      callback = data;
      data = {};
    }

    var options = data.options ? merge(self.options, data.options) : self.options;

    self.compile(path, function(error, fn) {
      if (error) { return callback(error); }

      callback(null, fn(data));
    });
  },

  compile: function(template, callback) {
    var self = this;

    self.template(template, function(error, template) {
      if (error) { return callback(error); }

      Async.waterfall([
        function(next) {
          self.parseIncludes(template, next);
        },
        function(template, next) {
          self.parseExtends(template, next);
        },
        function(template, next) {
          self.parseBlocks(template, next);
        },
        function(template, next) {
          self.prepareIterators(template, next);
        },
        function(template, next) {
          self._compile(template, next);
        }
      ], function(error, fn) {
        callback(error, fn);
      });
    });
  },

  parser: function(fn) {
    this.parsers.push(fn.bind(this));
  },

  prepareIterators: function(template, callback) {
    var self = this;

    template('[j\\:for], js[for], [j\\:each], js[each]').each(function(i, item) {
      item = $(item);

      var js = item[0].name === 'js';
      var statement = 'for';
      var attr = item[0].attribs[js ? 'for' : 'j:for'];

      if (!attr) {
        statement = 'each';
        attr = item[0].attribs[js ? 'each' : 'j:each'];
      }

      //var attrName = (js ? '' : 'j:') + statement;

      if (js) {
        item.replaceWith('['+ statement +':'+ attr +']'+ item.html() +'[/'+ statement +']');
      } else {
        item.prepend('['+ statement +':'+ attr +']');
        item.append('[/'+ statement +']');
        item.removeAttr((js ? '' : 'j:') + statement);
      }
    });

    callback(null, template);
  },
  
  _compile: function(template, callback) {
    var self = this;

    var content = template.html().replace(/'|\\/g, '\\$&');

    content = content.replace(new RegExp('\\[\\/(for|each|if|\/)\\]', 'g'), "'; } body += '");

    Async.waterfall([function(next) { next(null, content); }].concat(self.parsers), function(error, content) {
      if (error) {
        return callback(error);
      }

      content = "var body = '"+ content +"'; return body;";

      if (self.options.extract) {
        content = "var __data = __k = ''; for (__k in data) { __data += ' var '+__k+' = "+ self.options.dataname +"[\"'+__k+'\"];'; } eval(__data); __data = __k = undefined; " + content;
      }

      content = content.replace(/\n/g, '\\n').replace(/\t/g, '\\t').replace(/\r/g, '\\r').replace(/\n/g, '');

      var fn = new Function(self.options.dataname, content);
      
      callback(null, fn);
    });
  },

  parseExtends: function(template, callback) {
    var self = this;
    var includes = template('js[extend], [js-extend]');

    if (!includes) {
      return callback(null, template);
    }

    Async.forEach(includes, function(node, cb) {
      node = $(node);

      var statement = $(node)[0].name === 'js';
      var templateName = statement ? node.attr('extend') : node.attr('js-extend');

      if (!statement) {
        node.removeAttr('js-extend');
      }

      self.template(templateName, function(error, partial) {
        if (error) { return cb(error); }

        self.parseIncludes(partial, function(error, tmpl) {
          if (error) { return cb(error); }

          node.prepend(tmpl.html());

          self.parseBlocks(node, function(error, template) {
            node.html(template.html());

            cb(error);
          });
        });
      });
    }, function(error) {
      callback(error, template);
    });
  },

  parseBlocks: function(template, callback) {
    var self = this;
    var blocks = {};

    template = $.load(template.html());

    template('js[block], [js-block]').each(function(i, tag) {
      var isobject  = tag.name !== 'js';
      var blockName = isobject ? tag.attribs['js-block'] : tag.attribs.block;
      var isnew     = !blocks[blockName];

      blocks[blockName] = {
        selector: isobject ? '[js-block='+ blockName +']' : 'js[block='+ blockName +']',
        content: isobject ? $('<div/>').append($(tag).clone().removeAttr('js-block')).html() : $(tag).html(),
        isobject: isobject
      };

      if (!isnew) {
        $(tag).remove();
      }
    });

    template('js[prepend], [js-prepend]').each(function(i, tag) {
      var blockName = tag.name === 'js' ? tag.attribs.prepend : tag.attribs['js-prepend'];
      var selector = tag.name === 'js' ? 'js[prepend='+ blockName +']' : '[js-prepend='+ blockName +']';

      if (blocks[blockName]) {
        var prepend = tag.name==='js' ? $(tag).html() : $('<div/>').append($(tag).clone().removeAttr('js-prepend')).html();

        if (blocks[blockName].isobject) {
          blocks[blockName].content = $('<div/>').append($(blocks[blockName].content).prepend(prepend)).html();
        } else {
          blocks[blockName].content = prepend + blocks[blockName].content;
        }
      }

      template(selector).remove();
    });

    template('js[append], [js-append]').each(function(i, tag) {
      var blockName = tag.name === 'js' ? tag.attribs.append : tag.attribs['js-append'];
      var selector = tag.name === 'js' ? 'js[append='+ blockName +']' : '[js-append='+ blockName +']';

      if (blocks[blockName]) {
        var append = tag.name==='js' ? $(tag).html() : $('<div/>').append($(tag).clone().removeAttr('js-append')).html();

        if (blocks[blockName].isobject) {
          blocks[blockName].content = $('<div/>').append($(blocks[blockName].content).append(append)).html();
        } else {
          blocks[blockName].content += append;
        }
      }

      template(selector).remove();
    });

    for (blockName in blocks) {
      template(blocks[blockName].selector).replaceWith(blocks[blockName].content);
    }

    callback(null, template);
  },

  parseIncludes: function(template, callback) {
    var self = this;

    var includes = template('js[include], [js-include]');

    if (!includes) {
      return callback(null, template);
    }

    Async.forEach(includes, function(node, cb) {
      node = $(node);

      var statement = node[0].name === 'js';
      var partialName = statement ? node.attr('include') : node.attr('js-include');
      var method = statement ? 'replaceWith' : 'html';

      if (!statement) {
        node.removeAttr('js-include');
      }

      self.template(partialName, function(error, partial) {
        if (error) { return cb(error); }

        self.parseIncludes(partial, function(error, tmpl) {
          if (error) { return cb(error); }

          node[method](partial.html());

          cb();
        });
      });
    }, function(error) {
      callback(error, template);
    });
  },

  unescape: function(code) {
    return code.replace(/\\(\'|\\)/g, "$1").replace(/[\r\t\n]/g, ' ');
  }
};

function trim(str) {
  return str.replace(/^\s*/, '').replace(/\s*$/, '');
}

// if
Jinsoku.parser(function(template, next) {
  var self = this;

  template = template.replace(/\[if:([^\]]+)\]([\s\S]*?)\[\/if\]/g, function(m, condition, content) {
    var str = "'; if ("+ trim(condition) +") { body +='"+ content +"'; } body +='";

    str = str.replace(/\[(?:else|:([^\]]+)?)\]/g, function(m, condition) {
      return "'; } else "+ (condition ? "if ("+ trim(self.unescape(condition)) +")" : "") +"{ body +='";
    });

    return str;
  });

  next(null, template);
});

// case
Jinsoku.parser(function(template, next) {
  var self = this;

  template = template.replace(/\[case:\s*([^\]]+)\]([\s\S]*?)\[\/case\]/g, function(m, condition, content) {
    var str = "'; switch("+ self.unescape(condition) +") { [content] ";

    var cases = [];
    var contents = [];

    content = content.replace(/(\[:(?:([^\]]+))?\])/g, function(m, tag, condition) {
      cases.push(condition || 'default');

      return '[case]';
    });

    contents = content.split('[case]').slice(1);

    var temp = '';

    for (var i in cases) {
      temp += (cases[i] !== "default" ? " case "+ self.unescape(cases[i]) : " default") + ": body += '"+ contents[i] +"'; break;";
    }

    str += "} body += '";
    str = str.replace('[content]', temp);

    return str;
  });

  next(null, template);
});

// each
Jinsoku.parser(function(template, next) {
  var self = this;

  template = template.replace(/\[each:([^:\s]+)\s*(?::([^:\]]+))?\s*(?::([^:\]]+))?\]/g, function(m, items, key, iname) {
    iname = iname || 'i';
    items = self.unescape(items);

    var str = "'; for (var "+ iname +"=0, _len="+items+".length; "+ iname +"<_len; "+ iname +"++) { var "+ key +" = "+ items +"["+ iname +"]; body += '";

    return str;
  });

  next(null, template);
});

// for
Jinsoku.parser(function(template, next) {
  var self = this;

  template = template.replace(/\[for:([^:\s]+)\s*(?::([^:\]]+))?\s*(?::([^:\]]+))?\]/g, function(m, items, key, iname) {
    iname = iname || 'i';
    items = this.unescape(items);

    var str = "'; for (var "+ iname +" in "+ items +") { var "+ key +" = "+ items +"["+ iname +"]; body += '";

    return str;
  });

  next(null, template);
});

// var
Jinsoku.parser(function(template, next) {
  var self = this;

  template = template.replace(/(#|!)\[([\s\S]+?)\s*(?::([^\]]+))?\]/g, function(m, type, key, value) {
    var code;
    var encode = type === '!';
    
    key = key.replace(/^([a-z_$][a-z0-9_$\.\[\]\'\"]*)(.*)$/i, function(m, k, c) {
      code = c;
      
      return k;
    });

    code = self.unescape(code);

    return value !== undefined ? "'; var "+ key +" = "+ value + code +"; body += '" : "'+ "+ (encode ? "encodeHtml" : "") +"("+ (code ? key+code : key) +") +'";
  });

  next(null, template);
});

module.exports = Jinsoku;


