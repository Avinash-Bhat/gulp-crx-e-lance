function DoThen(o, slot, ctx, extra){
	return (function then(v){
		var target= o
		if(o instanceof Function){
			target= target.call(ctx||this)
		}
		target[slot].call(ctx||this, v, extra)
	})
}

module.exports= {
	DoThen: DoThen
}
