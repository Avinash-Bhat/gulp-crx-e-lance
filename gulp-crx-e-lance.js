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
	}
        function awaitThunk(awaits){
		return function(err, ok){
			sendAwaits(awaits, err, ok)
		}
        }

	var awaitTmp= [function(err,ok){
		options.tmp= function(cb){
			cb(err, ok)
		}
	  }],
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
//console.log('cleanup', ok)
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
//console.log('key', contents !== undefined)
					keyDone(undefined, contents)
				})
				return

			}
			if (exists){
//console.log('keyfile!')
				haveFile(keyfile)
				return
			}

			var base= path.basename(keyfile)
//console.log('mkdir',base)
			mkdirp(base, function(){
				var pubPath = keyfile + '.pub',
				  command = 'ssh-keygen -N "" -b 2048 -t rsa -f ' + path.basename(key),
				  keybase= path.dirname(keyfile)
//console.log('exec', command)
				exec(command, {cwd: keybase}, function(err) {
					if (err)
						throw err

//console.log('nokey')
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
//console.log('nullfile')
			cb(null, file)
			return
		}

		if (file.isStream()) {
//console.log('streamfile')
			cb(new gutil.PluginError('gulp-crx-e-lance', 'Streaming not supported'))
			return
		}
//console.log('file', file)

		var self= this,
		  await= doneAwait()
		options.tmp(function(err, tmp){


//console.log('got tmp', process.cwd(), file.path, options.input)

			if (err) {
//console.log('never tmped', err)
//console.log('but tmp', tmp)
				cb(new gutil.PluginError('gulp-crx-e-lance', err, {fileName: file.path}))
				return
			}

			var destFilename= path.join(tmp, path.relative(process.cwd(), file.path))
//console.log('desting', destFilename, path.dirname(destFilename))
			mkdirp(path.dirname(destFilename), function(err){
//console.log('mkdir', destFilename, file.contents)
				fs.writeFile(destFilename, file.contents, function(err){
					await(err)
					cb()
				})
			})

		})
	}).on('end', function(){
//console.log('end')
		function done(){
//console.log('done')
			if(options.cleanup)
				options.cleanup()
		}
		function wait(err, ok){
//console.log('WAIT',err, ok)
			if(awaitDone.length){
				awaitDone.pop()(wait)
			}else{
				done()
			}
		}
		wait()
	})
})
