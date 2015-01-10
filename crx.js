var promisify= require('thunkify-or-promisify'),
	fs= require('fs'),
	assert= require('assert'),
	path= require('path'),
	ChromeExtension= require('crx'),
	PromiseUtil= require('./promise-util')
var join= path.join
fs= promisify(fs)

var Crx= function(){
	if(this instanceof String){
		this.rootDirectory= this
	}
};

function defaulter(o, slot, gen){
	Object.defineProperty(o, slot, {
		configurable: true,
		enumerable: true,
		get: function(){
			var v= gen.call(o, slot)
			o[slot]= v
			return v
		}
	})
}

defaulter(Crx.prototype, 'crx', function(){
	var crx= new ChromeExtension(this)
	return crx
})

defaulter(Crx.prototype, 'rootDirectory', function(){
	return undefined;
})

Crx.prototype.pack= function(){
	return this.crx
		.load(this.rootDirectory)
		.then(PromiseUtil.DoThen(this.crx, 'pack', this))
		.then(PromiseUtil.DoThen(this, 'postPack', this))
		.then(PromiseUtil.DoThen(this, 'generateUpdateXML', this))
	// destroy?
}

Crx.prototype.postPack= function(buffer){
	return fs.writeFile(this.crxDest, buffer)
}

Crx.prototype.generateUpdateXML= function(){
	var updateXML= this.crx.generateUpdateXML()
	return fs.writeFile(this.updateXMLDest, data)
}

Crx.prototype.destroy= function(){
	this.crx.destroy()
}

module.exports= Crx
module.exports.Crx= Crx
module.exports.default= Crx
