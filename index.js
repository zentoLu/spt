#!/usr/local/bin/node
/* Javascript and stylus build tools
 * @author: Jony Zhang <zj86@live.cn>
 * @resources:
    https://github.com/mishoo/UglifyJS2/
    http://learnboost.github.io/stylus/
 */

var fs = require('fs'),
    path = require('path'),
    U2 = require("uglify-js"),
    stylus = require('stylus'),
    WORKING_DIR = path.dirname(process.argv[1]),
    EXT = process.argv[2];

process.chdir(WORKING_DIR);
    
var cfg = JSON.parse(fs.readFileSync('package.json')),
    ROOT = cfg.webroot,
    REQUIRE_RE = /"(?:\\"|[^"])*"|'(?:\\'|[^'])*'|\/\*[\S\s]*?\*\/|\/(?:\\\/|[^/\r\n])+\/(?=[^\/])|\/\/.*|\.\s*require|(?:^|[^$])\brequire\s*\(\s*(["'])(.+?)\1\s*\)/g,
    SLASH_RE = /\\\\/g;

console.log('building and minifying...');
task(cfg.build);

function task(obj){
    var out, val, ids = {},
        _toString = Object.prototype.toString;
    for (var k in obj) {
        out = path.dirname(k);
        val = obj[k];
        if (!checkExt(k)) continue;
        if (!fs.existsSync(out)) fs.mkdirSync(out);

        console.log('.');
        if (typeof val === 'string') {
            if (val.indexOf('*.') !== -1) {
                fetch(path.dirname(val), out);
            } else {
                build(val, out);
            }
        } else if ( _toString.call(val) === '[object Array]' ) {
            fs.writeFileSync(k, '');
            ids[k] = [];
            console.log('start concat ...');
            val.forEach(function(p){
                var name = path.basename(k);
                if (p.indexOf('*.') !== -1) {
                    fetch(path.dirname(p), out, name, ids[k])
                } else {
                    build(p, out, name, ids[k]);
                }
            });
            ids[k].length && fs.appendFileSync(k, arr2require(ids[k]));
            console.log('ok: ' + k);
        }
    }
    console.log('completed!');
}

function arr2require(arr){
    var code = '';
    arr.forEach(function(id){
        code += 'require("'+ id +'");';
    });
    return 'define(function(require){' + code + '});';
}

function checkExt(p){
    var ext = path.extname(p).replace('.', '');
    return !EXT || (EXT === 'styl' && ext === 'css') || EXT === ext;
}

function build(p, out, name, ids){
    var ext = path.extname(p).replace('.', '');
    if ( ext === 'js' ) {
        buildJS(p, out, name, ids);
    } else if ( ext === 'styl' ) {
        buildStyl(p, out, name);
    }
}

function fetch(src, out, name, ids){
    fs.readdirSync(src).forEach(function(f){
        var p = path.join(src, f);
        if (path.basename(f).indexOf('.bak') !== -1) {
            console.log('##skip##: ' + p);
        } else {
            build(p, out, name, ids);
        }
    });
}

function parseDependencies(code) {
    var ret = [];
    code.replace(SLASH_RE, "")
        .replace(REQUIRE_RE, function(m, m1, m2) {
            if (m2) {
                ret.push('"' + m2 + '"');
            }
        });
    return '[' + ( ret.length ? ret.join(',') : '' ) + '],';
}

function buildJS(p, out, name, ids) {
    var content = fs.readFileSync(p).toString(),
        ast = U2.parse(content),
        compressor,
        code = '',
        id,
        isConcat = !!name,
        name = name || path.basename(p),
        outfile = path.join(out, name).replace('.debug.', '.');
    
    compressor = U2.Compressor({
        sequences: false,
        warnings: false
    });

    ast.figure_out_scope();
    ast = ast.transform(compressor);

    ast.figure_out_scope();
    ast.compute_char_frequency();
    ast.mangle_names({
        // except: '$,require,exports'
    });

    code = ast.print_to_string();    

    var index = code.indexOf("define(")
    if (index !== -1 && code.substring(index+7, index+8) !== '"') {
        id = '/' + path.relative(ROOT, isConcat ? p.replace('.debug.', '.') : outfile).replace(/\\/g, '/');
        id = id.substring(0, id.length-3);
        ids && ids.push(id);
        code = code.substring(0, index) + 'define("' + id + '",' + parseDependencies(content) + code.substring(index+7);
    }
    code += '\n';

    fs[isConcat ? 'appendFileSync' : 'writeFileSync'](outfile, code);
    console.log( isConcat ? '    '+p : 'ok: '+outfile );
}

function buildStyl(p, out, name) {
    var isConcat = !!name,
        name = name || (path.basename(p, '.styl') + '.css'),
        content = fs.readFileSync(p).toString(),
        outfile = path.join(out, name);

        stylus( content )
            .set('compress', true)
            .set('filename', p)
            .render(function(err, code){
                if (err) throw err;
                fs[isConcat ? 'appendFileSync' : 'writeFileSync'](outfile, code);
                console.log( isConcat ? '    '+p : 'ok: '+outfile );
            });
}
