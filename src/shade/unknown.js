// Shade.unknown encodes a Shade expression whose value
// is not determinable at compile time.
//
// This is used only internally by the compiler

(function() {
    var obj = { _caches: {} };
    obj.fun = Shade.memoize_on_field("_cache", function(type) {
        return Shade._create_concrete_value_exp({
            parents: [],
            type: type,
            value: function() { throw "<unknown> should never get to compilation"; }
        });
    }, function(type) { 
        return type.repr();
    });
    Shade.unknown = function(type) {
        return obj.fun(type);
    };
})();
