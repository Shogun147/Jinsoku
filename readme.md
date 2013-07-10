# Jinsoku - template engine

High performance Javascript template engine inspired by Jade's power and doT's speed.

## Contents

- [Features](#features)
- [Installation](#installation)
- [Browser support](#browser-support)
- [Public API](#public-api)
    - [Options](#options)
- [Syntax](#syntax)
    - [Template inheritance](#template-inheritance)
    - [Template includes](#includes)
    - [Blocks](#blocks)
    - [Array and Object iterators](#array-and-object-iterators)
    - [Conditionals](#conditionals)
- [Examples](#examples)
- [Extending](#extending)
- [License](#license)

## Features

- Template inheritance
- Static includes
- Asynchronous partials loading support
- Blocks extending and cloning
- Iterators and Conditionals
- Extensible
...

## Installation

via npm:

    npm install jinsoku

### Browser support

Comming soon.

## Public API

* `resolve` resolve path to template files
* `template` read templates content
* `compile` compile template into function
* `render` compile and run template

```javascript
var Path = require('path');
var Fs   = require('fs');

var Jinsoku = require('jinsoku');

var root = process.cwd() + Path.sep;

// resolve paths to template files
Jinsoku.resolve = function(path) {
  return Path.join(root, 'views', path) + '.html';
}

// get template content from file system, cache or anythig else
Jinsoku.template = function(path, callback) {
  var self = this;

  path = self.resolve(path);

  if (self.cache[path]) { callback(null, self.cache[path]); }

  Fs.readFile(path, 'utf-8', function(error, content) {
    if (error) { return callback(error); }

    self.cache[path] = content;

    callback(null, content);
  });
}

var path = 'home'; // this template path after resolving will be: /path/to/app/views/home.html

// compile template to function
Jinsoku.compile(path, function(error, fn) {
  if (error) { throw error; }

  fn(data);
});
```

// render template
// this will compile template and generated function
Jinsoku.render(path, function(error, content) {
  log(error || content);
});

### Options

- `path`: `root +'views'+ Path.sep` Default root path for templates
- `dataname`: `data` Locals variable object name
- `extract`: `true` Extract data to local scope. If false, locals will be available as `dataname.varname`.
- `cache`: `true` Cache files content.
- `extension`: `.html` Default template file extension.

To set options we can call:
```javascript
Jinsoku.set('cache', false);
// or
Jinsoku.set({ cache: false, extension: '.tpl' });
// or set them as data.options when call render
var data = {
  ...
  options: { cache: false }
}
Jinsoku.render(path, data, ...);
// as second argument for compile
Jinsoku.compile(path, { dataname: 'locals' }, ...);

```

## Syntax
Jinsoku allow different ways to define template.

* As attributes
```html

// include partial into tag
<head j:include="layout/head"></head>
<head js-include="layout/head"></head>

// each iterator over array
<ul j:each="users :user">
  <li>#[user.username]</li>
</ul>
```

* As `<js>` tag
```html

// extend some template
<js extend="footer"></js>

// define a block
<js block="scripts"></js>
```
* With square brackets
```html

// simple include
[include: auth/login]

// array iterator
[each:users :user:i]
  #[i+1]. #[user.username]<br>
[/each]

```

## Template inheritance

Jinsoku supports template inheritance via `extend` keyword.

Suppose we have the following template content.html:
```html
<div id="content">
  <h2>Page title</h2>
  <p>Page content</p>
</div>
```

Now to extend this template in home.html:
```html
<body j:extend="content">
  <div id="copyright">&copy; 2012 MyCompany</div>
</body>
```

and result will be:

<body>
  <div id="content">
    <h2>Page title</h2>
    <p>Page content</p>
  </div>
  <div id="copyright">&copy; 2013 MyCompany</div>
</body>

## Includes

Includes allow you to statically include parts of content.

For example home.html which has head and body in separate files:
```html
<!doctype html>
<html lang="en-US">
  <head j:include="head"></head>
<body j:include="body">
  // or here [include: body]
</body>
</html>
```

## Blocks

Each template could be splitted in more parts named blocks.Then after extending this template we may replace content of the blocks, prepend and append content, or even clone them.

Suppose we have this head.html template:
```html
[block: meta]
  <meta charset="utf-8">
[/block]
<js block="scripts">
  <script type="text/javascript" src="/public/scripts/jquery.js"></script>
</js>
```

now in home.html to extend and add something to our head:
```html
<!doctype html>
<html lang="en-US">
<head j:extend="head">
  <meta name="keywords" content="Node.js, Javascript, HTML, CSS" j:append="meta">
  <script type="text/javascript" src="/public/scripts/app.js" j:append="scripts"></script>
</head>
<body>
  Body content
</body>
</html>
```

this will add meta tag to meta block and app.js script to scripts block so final home.html will look like so:
```html
<!doctype html>
<html lang="en-US">
<head>
  <meta charset="utf-8">
  <meta name="keywords" content="Node.js, JavaScript, HTML, CSS">
  <script type="text/javascript" src="/public/scripts/jquery.js"></script>
  <script type="text/javascript" src="/public/scripts/app.js"></script>
</head>
<body>
  Body content
</body>
</html>
```

To replace a block we need just to redefine it:
```html
// replace scripts block
<head j:extend="head">
  [block: scripts]
  <script src="/public/scripts/main.js"></script>
  [/block]
</head>
// now scripts block will contain only main.js script 
```

## Array and Object iterators

Jinsoku also supports friendly iterators over arrays(each) and objects(for).

For arrays:
var items = ['one', 'two', 'three', 'four'];

```html
<ul j:each="items :item:i">
  <li>#[i]. #[item]</li>
</ul>

// or
<js each="items :item:i">
  #[i]. #[item]<br>
</js>

// or
[each:items :item:i]
  #[i]. #[item]<br>
[/each]
```
`i` is current index, optional

For objects:
var obj = { foo: 'bar' };

```html
<ul j:for="obj :value:key">
  <li>#[key]: #[value]</li>
</ul>

// or
<js for="obj :value:key">
  #[key]: #[value]<br>
</js>

// or
[for:obj :value:key]
  #[key]: #[value]<br>
[/for]
```

## Conditionals

Jinsoku has shortcut support for `if` and `switch` statements.
```html
[if: User.logged_in]              // if (User.logged_in) {
  Welcome back, #[User.username]!
[: User.banned]                   // else if (User.banned) {
  Access denied, you are banned!
[:]                               // else {
  Hello guest, please login!
[/if]                             // }

[case: User.role]                      // switch(User.role) {
  [:'administrator']                   // case 'administrator':
    #[User.username] is administrator.
  [:'moderator']                       // break; case 'moderator':
    #[User.username] is moderator.
  [:]                                  // break; default:
    #[User.username] is user.
[/case]                                // break; }
```

## Variables

```html
// simple
<h2>#[page.title]</h2>

// escape html
<p>![page.content]</p>

// set a variable
#[page.title:'Jinsoku Template Engine']
```

### Unbuffered code for conditionals and anything else
```html
[# var keywords = ['template', 'mvc', 'dom', 'node.js']; #]

[# if (keywords.indexOf('mvc')) { #]
  Yahooo!
[# } else { #]
  Ooops!
[# } #]
```

## Examples


## Extending

You can easily extend jinsoku by adding new or replace one of the  existing parsers(if, case, each, for, var, evaluate).

To register a parser:
```javascript
Jinsoku.parser(function(template, next) {
  // do what you need with template
  // call next parser
  next(null, template);
});
```

## License

The MIT License

Copyright © 2013 D.G. Shogun147@gmail.com









