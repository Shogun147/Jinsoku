var isBrowser = !!(typeof(window) !== 'undefined' && navigator && document);

if (typeof($) === 'undefined') {
  var $ = require('cheerio');
}

if (typeof(async) === 'undefined') {
  var async = require('async');
}

if (isBrowser) {
  var root = window.location.protocol +'//'+ window.location.hostname +'/public/';
} else {
  var Path = require('path');
  var Fs   = require('fs');

  var root = Path.dirname(process.mainModule.filename) + Path.sep;
}

var merge = $.extend || function () {
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

  blocks: {},

  options: {
    path: root +'views'+ (isBrowser ? '/' : Path.sep),
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

    if (isBrowser) {
      $.ajax({
        async: true,
        cache: false, //self.options.cache,

        url: path,
        type: 'get',

        success: function(content) { callback(null, content); },
        error: function(error) { callback(error); }
      });
    } else {
      Fs.readFile(path, 'utf-8', function(error, content) {
        if (error) { return callback(error); };

        callback(null, content);
      });
    }
  },

  _template: function(path, callback) {
    var self = this;

    if (self.options.cache && self.templates[path]) {
      return callback(null, self.templates[path]);
    }

    self.template(path, function(error, content) {
      content = self.preparePartials(content);

      if (self.options.cache) {
        self.templates[path] = content;
      }

      callback(null, content);
    });
  },

  preparePartials: function(content) {
    content = content.replace(/\[(include|extend|block|prepend|append):\s*([^\]]+)\s*\]/g, function(m, action, template) {
      var tag = '<j '+ action +'="'+ template +'">'+ (action==='include' ? '</j>' : '');

      return tag;
    });
    content = content.replace(/\[\/(extend|block|prepend|append)\]/g, function(m, action, template) { return '</j>'; });

    return content;
  },

  render: function(path, data, callback) {
    var self = this;

    if (typeof(data) === 'function') {
      callback = data;
      data = {};
    }

    var options = data.options ? merge(self.options, data.options) : self.options; 

    data.options && (delete data.options);

    self.compile(path, options, function(error, fn) {
      if (error) { return callback(error); }

      try {
        var content = fn(data);

        callback(null, content);
      } catch (error) {
        callback(error);
      }
    });
  },

  compile: function(path, options, callback) {
    var self = this;

    if (typeof(options) === 'function') {
      callback = options;
      options = {};
    }

    self.set(options);

    self._template(path, function(error, template) {
      if (error) { return callback(error); }

      async.waterfall([
        function(next) {
          self.parseIncludes(template, next);
        },
        function(template, next) {
          self.parseExtends(template, next);
        },
        function(template, next) {
          self.parseBlocks(path, template, next);
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

  _compile: function(template, callback) {
    var self = this;

    var content = template.html().replace(/'|\\/g, '\\$&');

    content = content.replace(new RegExp('\\[\\/(for|each|\/)\\]', 'g'), "'; } body += '");

    async.waterfall([function(next) { next(null, content); }].concat(self.parsers), function(error, content) {
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

  parser: function(fn) {
    this.parsers.push(fn.bind(this));
  },

  prepareIterators: function(template, callback) {
    var self = this;

    var selector = '[j\\:for], [j-for], j[for], [j\\:each], [j-each], j[each]';
    (isBrowser ? $(selector, template) : template(selector)).each(function(i, item) {
      item = $(item); 

      var attribs = {
        'j:for': 'for',   'j-for': 'for',   'for': 'for',
        'j:each': 'each', 'j-each': 'each', 'each': 'each'
      };

      var js = item[0][isBrowser ? 'tagName' : 'name'].toLowerCase() === 'j';

      for (var k in attribs) {
        if (k in item[0][isBrowser ? 'attributes' : 'attribs']) {
          var statement = attribs[k];
          var attr = isBrowser ? item[0].attributes[k].value : item[0].attribs[k];

          break;
        }
      }

      if (js) {
        if (isBrowser) {
          $(item, template).replaceWith('['+ statement +':'+ attr +']'+ item.html() +'[/'+ statement +']')[0].outerHTML;
        } else {
          item.replaceWith('['+ statement +':'+ attr +']'+ item.html() +'[/'+ statement +']');
        }
      } else {
        item.prepend('['+ statement +':'+ attr +']');
        item.append('[/'+ statement +']');
        item.removeAttr(k);
      }
    });

    callback(null, template);
  },

  // Drop this in favor of includes and global blocks?
  parseExtends: function(template, callback) {
    var self = this;

    if (isBrowser) {
      template = $('<div/>').html(template);
    }

    var selector = 'j[extend], [j-extend], [j\\:extend]';
    var templates = isBrowser ? $(selector, template) : template('j[extend], [j-extend], [j\\:extend]');

    if (!templates) {
      return callback(null, isBrowser ? template : template.html());
    }

    async.forEach(templates, function(node, cb) {
      node = $(node);

      var statement = node[0][(isBrowser ? 'tagName' : 'name')].toLowerCase() === 'j';
      var attr = 'extend';

      if (!statement) {
        attr = node.attr('j:extend') ? 'j:extend' : 'j-extend';
      }

      var templateName = node.attr(attr);

      if (!statement) {
        (isBrowser ? $(node, template) : node).removeAttr(attr);
      }

      self._template(templateName, function(error, partial) {
        if (error) { return cb(error); }

        self.parseIncludes(partial, function(error, tmpl) {
          if (error) { return cb(error); }

          node.prepend(isBrowser ? tmpl : tmpl.html());

          self.parseBlocks(templateName, node, function(error, tmp) {
            if (error) { return cb(error); }

            var method = 'replaceWith';
            if (isBrowser && !statement) { 
              method = 'html'; 
            }

            (isBrowser ? $(node, template) : node)[method](tmp.html());

            cb(null);
          });
        });
      });
    }, function(error) {
      callback(error, isBrowser ? template : template.html());
    });
  },

  // TODO:
  // * make blocks globals?
  // * block cloning
  parseBlocks: function(templateName, template, callback) {
    var self = this;

    var blocks = self.blocks[templateName] = self.blocks[templateName] || {};

    template = isBrowser ? template : $.load(template);

    var selector = 'j[block], [j-block], [j\\:block]';
    (isBrowser ? $(selector, template) : template(selector)).each(function(i, node) {
      node = $(node);

      var statement = node[0][(isBrowser ? 'tagName' : 'name')].toLowerCase() === 'j';
      var attr = 'block';

      if (!statement) {
        attr = node.attr('j:block') ? 'j:block' : 'j-block';
      }

      var name = node.attr(attr);
      var isNew = !blocks[name];

      var selector = statement ? 'j[block='+ name +']' : '['+ attr +'='+ name +']';

      selector = selector.replace(/(:|\.)/g, '\\\$1');
      
      if (isNew) {
        blocks[name] = {
          selector: selector,
          content: statement ? node.html() : $('<div/>').html(node.clone().removeAttr(attr)).html(),
          isObject: !statement
        };
      } else {
        blocks[name].content = statement ? node.html() : $('<div/>').html(node.clone().removeAttr(attr)).html();
        blocks[name].isObject = !statement;
      }

      if (!isNew) {
        (isBrowser ? $(node, template) : node).remove();
      }
    });

    var selector = 'j[prepend], [j-prepend], [j\\:prepend], j[append], [j-append], [j\\:append]';
    (isBrowser ? $(selector, template) : template(selector)).each(function(i, node) {
      node = $(node);

      var statement = node[0][(isBrowser ? 'tagName' : 'name')].toLowerCase() === 'j';
      var action = 'prepend';

      ['append', 'j-append', 'j:append'].forEach(function(attribute) {
        if (node.attr(attribute)) {
          action = 'append';

          return false;
        }
      });

      var attr = statement ? action : (node.attr('j:'+ action) ? 'j:'+ action : 'j-'+ action);
      var name = node.attr(attr);

      var selector = statement ? 'j['+ action +'='+ name +']' : '['+ (attr===('j:'+ action) ? 'j\\:'+ action : 'j-'+ action) +'='+ name +']';
      selector = selector.replace('.', '\\\.');

      if (blocks[name]) {
        var content = statement ? node.html() : $('<div/>').html(node.clone().removeAttr(attr)).html();

        if (blocks[name].isObject) {
          blocks[name].content = $('<div/>').html($(blocks[name].content)[action](content)).html();
        } else {
          blocks[name].content = action==='prepend' ? content + blocks[name].content : blocks[name].content + content;
        }
      }

      (isBrowser ? $(selector, template) : template(selector)).remove();
    });

    for (name in blocks) {
      (isBrowser ? $(blocks[name].selector, template) : template(blocks[name].selector)).replaceWith(blocks[name].content);
    }

    callback(null, template);
  },

  parseIncludes: function(template, callback) {
    var self = this;

    template = isBrowser ? $('<div/>').html(template) : $.load(template);

    var selector = 'j[include], [j-include], [j\\:include]';
    var includes = isBrowser ? template.find(selector) : template(selector);

    if (!includes) {
      return callback(null, template);
    }

    async.forEach(includes, function(node, cb) {
      node = $(node);

      var statement = node[0][(isBrowser ? 'tagName' : 'name')].toLowerCase() === 'j';
      var attr = 'include';

      if (!statement) {
        attr = node.attr('j:include') ? 'j:include' : 'j-include';
      }

      var partialName = node.attr(attr);

      // TODO: allow prepend or append included template to node? replace html with append/prepend?
      // or better just append included content in case there is something already
      var method = statement ? 'replaceWith' : 'html';

      if (!statement) {
        (isBrowser ? $(node, template) : node).removeAttr(attr);
      }

      self._template(partialName, function(error, partial) {
        if (error) { return cb(error); }

        self.parseIncludes(partial, function(error, tmpl) {
          if (error) { return cb(error); }

          if (isBrowser) {
            tmpl = $('<div/>').html(tmpl);
          }

          (isBrowser ? $(node, template) : node)[method](tmpl.html());

          cb();
        });
      });
    }, function(error) {
      callback(error, (isBrowser ? template.html() : template));
    });
  },

  unescape: function(code) {
    return code.replace(/\\(\'|\\)/g, "$1").replace(/[\r\t\n]/g, ' ');
  }
};

function trim(str) {
  return str.replace(/^\s+|\s+$/g, '');
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

// evaluate
Jinsoku.parser(function(template, next) {
  var self = this;

  template = template.replace(/\[#([\s\S]+?)#\]/g, function(m, code) {
    return "'; "+ self.unescape(code) +" body += '";
  });

  next(null, template);
});

if (typeof(module) !== 'undefined' && module.exports) {
  module.exports = Jinsoku;
} else if (typeof(define) === 'function' && define.amd) {
  define(function() { return Jinsoku; });
} else {
  (function() { return this || (0, eval)('this'); }()).Jinsoku = Jinsoku;
}


