# Jinsoku - template engine

High performance Javascript template engine inspired by Jade's power and doT's speed.

## Contents

- [Features](#features)
- [Installation](#installation)
- [Browser support](#browser-support)
- [Public API](#public-api)
    - [Settings](#options)
- [Syntax](#syntax)
    - [Template inheritance](#template-inheritance)
    - [Template includes](#includes)
    - [Block extending/clone/prepend/append](#blocks)
    - [Array and Object iterators](#array-and-object-iterators)
    - [Conditionals](#conditionals)
- [Examples](#examples)
- [Extending](#extending)
- [License](#license)

## Features

- Fast & Furious
- Client-side support
- Template inheritance
- Static includes
- Asynchronous partials loading support
- Blocks extending and cloning
- Iterators and Conditionals
- Extensible

## Installation

via npm:

    npm install jinsoku

### Browser support

Jinsoku has no dependencies so you could just require it.

## Public API

Before compile something we need to set `Jinsoku.template` function, this is used to get content for a template path. It also support async loading.

Ex. node.js:

    var path    = process.cwd() + '/views/';
    var Fs      = require('fs');
    var Jinsoku = require('jinsoku');

    // @template - template path, [include: this/is/path] or [extend: view/path]
    // @callback - a callback which get template content as argument
    Jinsoku.template = function(template, callback) {
      Fs.readFile(path + template + '.html', 'utf-8', function(error, callback) {
        callback(content);
      })
    };

Ex. browser:

    <script type="text/javascript" src="/jinsoku.js"></script>
    <script type="text/javascript">
      Jinsoku.template = function(template, callback) {
        // use jQuery ajax call
        $.ajax({
          url: '/views/'+template+'.html'
        }).done(function(content) {
          callback(content);
        });
      }
    </script>

Then we can compile templates:

    // For sync templates loading compiled function is also returned
    var fn = Jinsoku.compile('home'); // home.html template

    fn(locals);

    // but for async loading we must wait it from callback
    Jinsoku.compile('home', function(fn) {
      fn(locals);
    });

### Options

Before compile you could set some options in `Jinsoku.settings`:

- `strip`: `true` - Strip whitespaces of the html output or not.
- `dataname`: `data` - Locals variable object.
- `extract`: `false` - Extract locals to local scope. When `true` locals are available directly, without `dataname` prefix, but compiled function will run slower.
- `import_deps`: `true` - If dependencies should be included in compiled template or not.
- `wrap`: `false` - Wrap function into a scope or not, if `false` then `this` is global scope.
- `scope`: `{}` - The scope in which fn runs if `wrap=true`.

## Template inheritance

Jinsoku supports template inheritance via `extend` keyword.

Suppose we have the following template content.html:

    <div id="content">
      <h2>Page title</h2>
      <p>Page content</p>
    </div>

Now to extend this template in home.html:

    [extend: content]
      <div id="copyright">&copy; 2012 MyCompany</div>
    [/extend]

and result will be:

    <div id="content">
      <h2>Page title</h2>
      <p>Page content</p>
    </div>
    <div id="copyright">&copy; 2012 MyCompany</div>

We could extend more templates at the same time which will compile to one bigger.

For example home.html:

    <!DOCTYPE HTML>
    <html lang="en-US">
      <head>
        [extend: head]
          <title>Jinsoku Template Engine</title>
        [/extend]
      </head>
    <body>
      [extend: top][/extend]
  
      [extend: content][/extend]
  
      [extend: footer][/extend]
    </body>
    </html>

## Includes

Includes allow you to statically include parts of content.

For example home.html which has body in separate file:

    <!DOCTYPE HTML>
    <html lang="en-US">
      <head>
        [extend: head]
          <title>Jinsoku Template Engine</title>
        [/extend]
      </head>
    <body>
      [include: body]
    </body>
    </html>

and body.html:

    [extend: top][/extend]
  
    [extend: content][/extend]
  
    [extend: footer][/extend]

## Blocks

Each template could be splitted in more parts named blocks.Then after we extend this template we may replace content of the blocks, prepend and append content, or even clone them.

Suppose we have this head.html template:

    <head>
      [block: meta]
        <meta charset="utf-8">
      [/block]
      [block: scripts]
        <script type="text/javascript" src="/public/scripts/jquery.js"></script>
      [/block]
    </head>

now in home.html to extend and add something to our head:

    <!DOCTYPE HTML>
    <html lang="en-US">
    [extend: head]
      [append: meta]
        <meta name="keywords" content="Node.js, JavaScript, HTML, CSS">
      [/append]
      [append: scripts]
        <script type="text/javascript" src="/public/scripts/app.js"></script>
      [/append]
    [/extend]
    <body>
      Body content
    </body>
    </html>

this will add meta tag to meta block and app.js script to scripts block so final home.html will look like: 

    <!DOCTYPE HTML>
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

To replace a block we need just to redefine it:

    [extend: head]
      [block: meta]
        <meta name="keywords" content="Node.js, JavaScript, HTML, CSS">
      [/block]
    [/extend]

Now meta block will contain only meta keywords without the charset.

There also is the possibility to clone a block at the same time. To do this just add exclamation mark after block name and the block will be cloned in this place.

    [append: menu!]
      <li><a href="/about">About</a></li>
    [/append]

This will append new item to the menu and clone entire menu in this place.

To just clone a block use `clone`:

    [clone: pagination]

## Array and Object iterators

Jinsoku also supports friendly iterators over arrays(each) and objects(for).

For arrays:

    [# var items = ['one', 'two', 'three', 'four']; #]

    [each:items :item]
      <li>#[item]</li>
    [/each]
    
    //result
    <li>one</li>
    <li>two</li>
    <li>three</li>
    <li>four</li>

    //with index:
    [each:items :item:i]
      <li>#[i+1]. #[item]</li>
    [/each]

    //result
    <li>1. one</li>
    <li>2. two</li>
    <li>3. three</li>
    <li>4. four</li>

For objects:

    [# var obj = { foo: 'bar' }; #]

    [for:obj :value:key]
      <li>#[key]: #[value]</li>
    [/for]

    //result
    <li>foo: bar</li>

## Conditionals

Jinsoku has shortcut support for `if` and `switch` statements.

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


## Examples

One more complex example:

## Extending

You can easily extend jinsoku by adding new or replace one of the  existing parsers(if, case, each, for, var, evaluate).

To register a parser:

    @name - parser name, if the parser with same name already exists then he will be replaced by this one
    @regexp - regular expression for parser
    @callback - callback for regexp matching, it gets template name and view object as first 2 arguments and then arguments of the regexp match
    Jinsoku.parser(name, regexp, callback);

The returned value from callback is used as replacer for regexp match.
    
## License

The MIT License

Copyright © 2012 D.G. Shogun Shogun147@gmail.com









