var gl;
var interactor;

// things to read: 
// http://www.valvesoftware.com/publications/2007/SIGGRAPH2007_AlphaTestedMagnification.pdf

//////////////////////////////////////////////////////////////////////////////

$().ready(function () {
    var canvas = document.getElementById("webgl");
    interactor = Facet.UI.center_zoom_interactor({
        width: canvas.width,
        height: canvas.height,
        zoom: 0.0001,
        center: vec.make([10000, -5000]),
        widest_zoom: 1e-6
    });

    gl = Facet.init(canvas, {
        clearColor: [1,1,1,1], // 0,0,0,1],
        interactor: interactor
    });
    function checkerboard_pattern(c1, c2) {
        function xor(a, b) { return a.and(b.not()).or(b.and(a.not())); }
        function even_p(p) { 
            var v = Shade(p).floor().div(2);
            return v.eq(v.floor());
        };
        var fc = Shade.fragCoord();
        var x_even = even_p(fc.x()), y_even = even_p(fc.y());
        return Shade.ifelse(xor(x_even, y_even), c1, c2);
    }
    
    Facet.Scene.add(Facet.Text.string_batch({
        string: "The quick brown fox jumps\nover the lazy dog.\nFive boxing wizards\njump quickly.",
        font: _typeface_js.faces.gentilis.normal.normal,
        position: function(p) { return interactor.camera(p); },
        color: function(p) { 
            // return Shade.color("black");
            return checkerboard_pattern(Shade.color("red"), Shade.color("black"));
        }
    }));
});
