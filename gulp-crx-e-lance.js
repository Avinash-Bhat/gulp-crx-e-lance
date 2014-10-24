'use strict';

var fs= require('fs');
var path= require('path')
var gutil= require('gulp-util')
var through= require('through2')
var mkdirp= require('mkdirp')
var mktmpdir= require('mktmpdir')
var crx= require('crx')


var _crx= '.crx'

module.exports= (function pack(options) {
	options= options || {}

	if (!options.dest){
		throw new gutil.PluginError('gulp-crx-e-lance', '`dest` or `name` required')
	}
	if(options.dest.endsWith(_crx)){
		options.dest= options.dest.substring(0, options.dest.length-_crx.length)
	}

	function sendAwaits(awaits, err, ok){
		if(err)
			err= new gutil.PluginError('gulp-crx-e-lance', err)
		for(var i in awaits){
			awaits[i](err, ok)
		}
		awaits.splice(0)

		options.tmp= function(cb){
			cb(err, ok)
		}
	}
        function awaitThunk(awaits){
		return function(err, ok){
			sendAwaits(awaits, err, ok)
		}
        }

	var awaitTmp= [],
	  tmp= options.tmp
	options.tmp= function(cb){
		awaitTmp.push(cb)
	}
	function insureDir(err, dir){
		if(err){
			sendAwaits(awaitTmp, err)
			return
		}
		mkdirp(dir, awaitThunk(awaitTmp))
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
		mktmpdir('gulp-crx-e-lance', base, awaitThunk(awaitTmp))
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
			if(_err !== undefined || _ok !== undefined){
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
			var noCb = _cb === undefined
			if(_cb){
				_cb(err, ok)
				_cb= null
				return
			}
			if(noCb && _err !== undefined && _ok !== undefined ){
				throw new Error('freaky weird gulp-crx-e-lance state')
			}
			_err= err
			_ok= ok
		}

		return cb
	}

	var keyDone= doneAwait()
	if(options.key){
		var key= options.key
		options.key= function(cb){
			keyDone(undefined, key)
		}
	}else{
		var keyfile= options.keyfile|| 'key.pem'
		fs.exists(keyfile, function(exists) {
			function haveFile(file){
				fs.readFile(file, function(err, contents){
					if(!err)
						key= contents
					options.key= contents
					keyDone(undefined, contents)
				})
				return

			}
			if (exists){
				haveFile(keyfile)
				return
			}

			var base= path.basename(keyfile)
			mkdirp(base, function(){
				var pubPath = keyfile + '.pub',
				  command = 'ssh-keygen -N "" -b 2048 -t rsa -f ' + path.basename(key),
				  keybase= path.dirname(keyfile)
				exec(command, {cwd: keybase}, function(err) {
					if (err)
						throw err

					haveFile(keyfile)

					// TODO: find a way to prevent .pub output
					// TODO: i kind of like it but i'm not sure where this'll land and if it's persistent enough
					//fs.unlink(pubPath)
				})
			})
		})
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

		var self= this,
		  await= doneAwait()
		options.tmp(function(err, tmp){

			options.input= path.join(path.dirname(file.path), '.' + path.basename(file.path))

			if (err) {
				cb(new gutil.PluginError('gulp-crx-e-lance', err, {fileName: file.path}))
				return
			}

			var destFilename= path.join(tmp, file.path)
			mkdirp(path.basename(destFilename), function(err){
				fs.writeFile(destFilename, file.contents, await)
			})

		})
	}).on('end', function(){
		function done(){
			if(options.cleanup)
				options.cleanup()
		}
		function wait(err, ok){
			if(awaitDone.length){
				awaitDone.pop()(wait)
			}else{
				done()
			}
		}
		wait()
	})
})
