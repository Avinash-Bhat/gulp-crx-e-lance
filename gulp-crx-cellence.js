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
		mktmpdir('gulp-crx-cell-lance', base, sendAwaits)
	}


	var cleanup
	if(options.cleanup instanceof Function){
		cleanup= options.cleanup
	}else if(options.cleanup === true){
		cleanup= function(err){
			if(options.cleanup){
				options.tmp(function(err,ok){
					if(err)
						return
					fs.rmdir(ok)
				})
			}
		}
	}else if(options.cleanup === false){
	}else if(options.cleanup){
		sendAwaits(new TypeError('unexpected type for `cleanup` parameter'))
	}

	var awaitDone= [],
	options.done= function(cb){
		awaitDone.push(cb)
	}

	if(cleanup)
		awaitDone.push(cleanup)
	return through.obj(function (file, enc, cb) {
		if (file.isNull()) {
			cb(null, file)
			return
		}

		if (file.isStream()) {
			cb(new gutil.PluginError('gulp-vulcanize', 'Streaming not supported'))
			return
		}

		var self= this
		options.tmp(function(err, tmp){

			var destFilename= path.join(options.dest, path.basename(file.path))
			options.input= path.join(path.dirname(file.path), '.' + path.basename(file.path))
			options.output= destFilename
		})
	}).on('end', function(){
	])
})
