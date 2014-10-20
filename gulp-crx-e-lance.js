'use strict';

var fs= require('fs');
var path= require('path')
var gutil= require('gulp-util')
var through= require('through2')
var mkdirp= require('mkdirp')
var crx= require('crx')

function keygen(dir, cb) {
	dir = resolve(cwd, dir)

	var key = join(dir, "key.pem")

	fs.exists(key, function(exists) {
		if (exists) return cb && typeof(cb) == "function" && cb()

		var pubPath = key + ".pub"
			, command = "ssh-keygen -N '' -b 1024 -t rsa -f key.pem"

		exec(command, {cwd: dir}, function(err) {
			if (err) throw err

			// TODO: find a way to prevent .pub output
			fs.unlink(pubPath)
			cb && typeof(cb) == "function" && cb()
		})
	})
}


var _crx= '.crx'

module.exports= (function pack(options) {
	options= options || {}

	if (!options.dest){
		throw new gutil.PluginError('gulp-crx-e-lance', '`dest` or `name` required')
	}
	if(options.dest.endsWith(_crx)){
		options.dest= options.name.substring(0, options.dest.length-_crx.length)
	}

	function sendAwaits(awaits, err, ok){
		if(err)
			err= new gutil.PluginError('gulp-crx-e-lance', err)
		for(var i in awaits){
			awaits[i](err, ok)
		}
		options.tmp= function(cb){
			cb(err, ok)
		}
	}

	var awaitTmp= [],
	  tmp= options.tmp
	options.tmp= function(cb){
		awaitTmp.push(cb)
	}
	function insureDir(err, dir){
		if(err){
			sendAwaits(err)
			return
		}
		mkdirp(dir, sendAwaits)
	}

	if(tmp instanceof Function){
		tmp(insureDir)
	}else if(tmp instanceof String){
		insureDir(undefined, tmp)
	}else if(tmp){
		sendAwaits(new TypeError('unexpected type for `tmp` parameter'))
	}else{
		var base= path.dirname(options.dest)
		if(base == '.')
			base= undefined
		else
			base= [base]
		mktmpdir('gulp-crx-e-lance', base, sendAwaits)
	}


	var cleanup
	if(options.cleanup instanceof Function){
		cleanup= options.cleanup
	}else if(options.cleanup === true || options.cleanup === false){
		// default cleanup
		options.cleanup= true
		cleanup= function(err){
			options.tmp(function(err,ok){
				if(err)
					return
				fs.rmdir(ok)
			})
		}
	}else if(options.cleanup){
		sendAwaits(new TypeError('unexpected type for `cleanup` parameter'))
	}

	var awaitDone= []
	function doneAwait(){
		var _cb,
		  _err,
		  _ok

		awaitDone.push(function(cb){
			if(_err || _ok){
				// finish
				cb(_err, _ok)
				_cb= null
				_err= null
				_ok= null
			}else{
				// cb when ready
				_cb= cb
			}
		})

		// resolve handler
		function cb(err, ok){
			if(_cb){
				_cb(err, ok)
				_cb= null
				return
			}
			if(!_cb && !_err && !_ok){
				throw new Error('freaky weird gulp-crx-e-lance state')
			}
			_err= err
			_ok= ok
		}

		return cb
	}
	return through.obj(function (file, enc, cb) {
		if (file.isNull()) {
			cb(null, file)
			return
		}

		if (file.isStream()) {
			cb(new gutil.PluginError('gulp-crx-e-lance', 'Streaming not supported'))
			return
		}

		var self= this
		options.tmp(function(err, tmp){

			var destFilename= path.join(options.dest, path.basename(file.path))
			options.input= path.join(path.dirname(file.path), '.' + path.basename(file.path))
			options.output= destFilename

			if (err) {
				cb(new gutil.PluginError('gulp-crx-e-lance', err, {fileName: file.path}))
				return
			}

			fs.writeFile(options.input, file.contents, doneAwait())
		})
	}).on('end', function(){
		function wait(err, ok){
			if(awaitDone.length){
				awaitDone.pop()(wait)
			}else{
				if(options.cleanup)
					cleanup()
			}
		}
		wait()
	})
})
