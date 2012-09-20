(function() {
  "use strict";
	
	var Jinsoku = {
		version: '0.1.0',
		
		settings: {
			strip: true,
			dataname: 'data',
			extract: false,
			import_deps: true,
			wrap: false,
			scope: {}
		},
		
		keys: '',
		
		template: null,
		
		parsers: {},
		
		compile: function(template, options, callback) {
			var self = this;
			
			if (typeof(options) == 'function') {
				callback = options;
				options = {};
			}
			
			var fn;
			
			var view = {
				content: '',
				templates: {},
				deps: [],
				mixins: {},
				pending: 1
			}
			
			self.extend(template, view, function() {
			  var templates = Object.keys(view.templates);
			
				view.templates[template].content = "var body = '"+ view.templates[template].content +"'; return body;";
				
				if (self.settings.extract) {
					view.templates[template].content = "var __data = ''; for (var __k in data) { __data += ' var '+__k+' = data[\"'+__k+'\"];'; } eval(__data); __data = __k = undefined; " + view.templates[template].content;
				}
				
	      for (var i=templates.length; i>0; i--) {
		      var tpl = view.templates[templates[i-1]];
		
		      for (var partial in tpl.partials) {
			      view.templates[partial].content += tpl.partials[partial];
		      }
	      }
	
	      for (var tpl in view.templates) {
		      self.parse(tpl, view);
		
		      for (var block in view.templates[tpl].blocks) {
			      var b = view.templates[tpl].blocks[block];
			
			      b.content = b.prepend.join('') + b.content + b.append.join('');
			
			      view.templates[tpl].content = view.templates[tpl].content.replace('{#block:'+ block +'#}', self._parse_block(b.content));
		      }
	      }
	
	      for (var tpl in view.templates) {
		      for (var partial in view.templates[tpl].partials) {
			      view.templates[template].content = view.templates[template].content.replace('{#template:'+ partial +'#}', view.templates[partial].content);
		      }
	      }
	
				if (self.settings.strip) {
					view.templates[template].content = view.templates[template].content.replace(/(^|\r|\n)\t*\s+|\s+\t*(\r|\n|$)/g,' ').replace(/\r|\n|\t|\/\*[\s\S]*?\*\//g,'');
				}
				
	      view.templates[template].content = view.templates[template].content.replace(/\n/g, '\\n').replace(/\t/g, '\\t').replace(/\r/g, '\\r').replace(/\n/g, '');
	
	      if (self.settings.import_deps) {
		      var defined = {};
					view.deps.forEach(function(func) {
						if (!defined[func]) {
							view.templates[template].content = self[func].toString() + view.templates[template].content;

							defined[fn] = true;
						}
					});
	      }
	
	      fn = new Function(self.settings.dataname, view.templates[template].content);
	
	      if (self.settings.wrap) {
		      fn = new Function('data', fn.toString() + " return anonymous.call(Jinsoku.settings.scope, data);");
	      }
	
	      callback && callback(fn);
			});
			
			return fn;
		},
	  
	  parse: function(template, view) {
		  var self = this;
		  var tpl = view.templates[template];
		
      tpl.content = tpl.content.replace(/\[(block|prepend|append):\s*([^\]]+)([!]?)\]([\s\S]*?)\[\/\1\]/g, function(m, action, name, clone, content) {
			  var isnew = false;
			
				if (!tpl.blocks[name]) {
					tpl.blocks[name] = {
						content: '',
						prepend: [],
						append: []
					};

					isnew = true;
				}
				
				if (action == 'block') {
					tpl.blocks[name].content = content;
					
					return isnew || clone ? '{#block:'+ name +'#}' : '';
				} else {
					tpl.blocks[name][action].push(content);

					return '';
				}
		  });
		
		  self._parse(template, view);
	  },
	
		_parse: function(template, view) {
			var self = this;
			
			var template = view.templates[template];
			
			for (var parser in self.parsers) {
			  parser = self.parsers[parser];

			  template.content = template.content.replace(parser.regexp, function() {
				  var args = Array.prototype.slice.call(arguments, 1);

				  args.unshift(template, view);

				  return parser.callback.apply(self, args);
			  });
		  }

		  template.content = template.content.replace(new RegExp('\\[\\/('+ Object.keys(self.parsers).join('|') +'|\/)\\]', 'g'), "'; } body += '");
		},
	
	  	_parse_block: function(content) {
			var self = this;

			for (var parser in self.parsers) {
			  parser = self.parsers[parser];

			  content = content.replace(parser.regexp, function() {
				  var args = Array.prototype.slice.call(arguments, 1);

				  args.unshift(null, null);

				  return parser.callback.apply(self, args);
			  });
		    }

			content = content.replace(new RegExp('\\[\\/('+ Object.keys(self.parsers).join('|') +'|\/)\\]', 'g'), "'; } body += '");

		    return content;
		  },
	
	  extend: function(template, view, callback) {
		  var self = this;
		
		  self.template(template, function(content) {
			  content = content.replace(/`|'|\\/g, '\\$&');
			
				view.templates[template] = {
					content: content,
					partials: {},
					blocks: {},
					includes: 0
				};

        self.include(template, view, function() {
	        view.templates[template].content = view.templates[template].content.replace(/\[extend:\s*([^\]]+)\]([\s\S]*?)\[\/extend\]/g, function(m, tmpl, code) {
						view.pending++;

						view.templates[template].partials[tmpl] = code;

						self.extend(tmpl, view, callback);

						return '{#template:'+ tmpl +'#}';
					});
					
					if (!--view.pending) {
						callback();
					}
        });
			});
	  },
	
	  include: function(template, view, callback) {
		  var self = this;
		
		  var regexp = /\[include:\s*([^\]]+)\s*\]/g;
		  var str = view.templates[template].content;
		  var includes = [];
		  var m;
		  
		  while ((m = regexp.exec(str)) != null) {
			  includes.push(m[1]);
		  }
		
		  view.templates[template].includes += includes.length;
		
		  if (!view.templates[template].includes) {
			  callback && callback();
		  }
		
		  includes.forEach(function(tmpl) {
			  self.template(tmpl, function(content) {
				  content = content.replace(/`|'|\\/g, '\\$&');
				
				  view.templates[template].content = view.templates[template].content.replace(new RegExp('\\[include:\\s*'+ tmpl +'\\s*\\]'), content);
				  
				  self.include(template, view, callback);
				
				  if (!--view.templates[template].includes) {
					
					  callback && callback();
				  }
			  });
		  });
	  },
	
	  parser: function(name, regexp, callback) {
			this.parsers[name] = {
				regexp: regexp,
				callback: callback
			};
		}
	};

  Jinsoku.parser('clone', /\[clone:\s*([^\]]+)\s*\]/g, function(template, view, block) {
	  return (template.blocks[block] && template.blocks[block].content || '#block: '+block+'#');
	});

	Jinsoku.parser('if', /\[if:([^\]]+)\]([\s\S]*?)\[\/if\]/g, function(template, view, condition, content) {
		var str = "'; if ("+ condition +") { body +='"+ content +"'; } body +='";

		str = str.replace(/\[(?::([^\]]+)?)\]/g, function(m, condition) {
			return "'; } else "+ (condition ? "if ("+ condition +")" : "") +"{ body +='";
		});

		return str;
	});

	Jinsoku.parser('each', /\[each:([^:\]\s]+)\s*(?::([^:\]]+))?\s*(?::([^:\]]+))?\]/g, function(template, view, items, key, iname) {
		iname = iname || 'i';

		var str = "'; for (var "+ iname +"=0, _len="+items+".length; "+ iname +"<_len; "+ iname +"++) { var "+ key +" = "+ items +"["+ iname +"]; body += '";

		return str;
	});

	Jinsoku.parser('for', /\[for:([^:\]\s]+)\s*(?::([^:\]]+))?\s*(?::([^:\]]+))?\]/g, function(template, view, items, key, iname) {
		iname = iname || 'i';

		var str = "'; for (var "+ iname +" in "+ items +") { var "+ key +" = "+ items +"["+ iname +"]; body += '";

		return str;
	});

	Jinsoku.parser('case', /\[case:\s*([^\]]+)\]([\s\S]*?)\[\/case\]/g, function(template, view, condition, content) {
		var str = "'; switch("+ condition +") {"+ content.replace(/^\n*/, ' ').replace(/\n*$/, ' ') +" ";

		str = str.replace(/\[:(?:([^\]]+))?\](?:([^:\[]+))/g, function(m, condition, content) {
			return (condition ? " case "+condition : " default") +": body += '" + content + "'; break;";
		});

		str += "} body += '";

		return str;
	});

	Jinsoku.parser('var', /(#|!)\[([\s\S]+?)\s*(?::([^\]]+))?\]/g, function(template, view, type, key, value) {
		var code;
		
		var encode = type === '!';
		
		encode && view.deps.push('encodeHtml');
		
		key = key.replace(/^([a-z_$][a-z0-9_$\.\[\]\'\"]*)(.*)$/i, function(m, k, c) {
			code = c;
			
			return k;
		});
		
		return value !== undefined ? "'; var "+ key +" = "+ value + code +"; body += '" : "'+ "+ (encode ? "encodeHtml" : "") +"("+ (code ? key+code : key) +") +'";
	});
	
	Jinsoku.parser('evaluate', /\[#([\s\S]+?)#\]/g, function(template, view, code) {
		return "'; "+ this.unescape(code) +" body += '";
	});
	
	Jinsoku.encodeHtml = function encodeHtml(code) {
		var rules = { "&": "&#38;", "<": "&#60;", ">": "&#62;", "\"": "&#34;", "'": "&#39;", "\/": "&#47;", "`": "&#96;" };
		var regexp = /&(?!#?\w+;)|<|>|"|'|\//g;
		
		return code ? code.toString().replace(regexp, function(m) { return rules[m] || m; }) : code;
	}
	
	Jinsoku.unescape = function unescape(code) {
		return code.replace(/\\('|\\)/g, "$1").replace(/[\r\t\n]/g, ' ');
	}
	
	var g = (function(){ return this || (0, eval)('this'); }());

	if (typeof module !== 'undefined' && module.exports) {
		module.exports = Jinsoku;
	} else if (typeof define === 'function' && define.amd) {
		define(function(){return Jinsoku;});
	} else {
		g.Jinsoku = Jinsoku;
	}
	
	if (typeof(global) !== 'undefined') {
		global.Jinsoku = Jinsoku
	}
}());