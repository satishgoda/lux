var gl;
var points_batch;
var rb;
var pointsize, pointweight;
var interactor;

//////////////////////////////////////////////////////////////////////////////

function make_points_batch(x, y, width, height)
{
    var points_model = Facet.model({
        x: x,
        y: y,
        type: "points"
    });
    var pt = Shade.vec(points_model.x, points_model.y);

    rb = Facet.render_buffer({ width: width, height: height, type: gl.FLOAT });
    var rb_batch = rb.make_screen_batch(function(texel_accessor) {
        return Shade.vec(1,1,1,2)
            .sub(Shade.Utils.lerp([
                Shade.color("white"),
                Shade.color("#d29152"),
                Shade.color("sienna"),
                Shade.color("black")])(texel_accessor().at(0).add(1).log()));
    });

    var batch = Facet.bake(points_model, {
        position: interactor.project(pt),
        mode: Facet.DrawingMode.additive,
        color: Shade.pointCoord().sub(Shade.vec(0.5, 0.5))
            .norm().pow(2).neg()
            .mul(20)
            .exp()
            .mul(pointweight)
            .mul(interactor.zoom.pow(0.33))
            .mul(Shade.color("white")),
        point_size: interactor.zoom.pow(0.5).mul(pointsize)
    });

    return {
        draw: function() {
            rb.with_bound_buffer(function() {
                gl.clear(gl.COLOR_BUFFER_BIT);
                if (batch)
                    batch.draw();
            });
            rb_batch.draw();
        }
    };
}

function init_gui()
{
    Facet.UI.parameter_slider({ element: "#pointsize",   parameter: pointsize,   min: 0, max: 10 });
    Facet.UI.parameter_slider({ element: "#pointweight", parameter: pointweight, min: 0, max: 1  });

    $("#set_center").click(function() {
        var x = Number($("#realvalue").val()),
            y = Number($("#imagvalue").val());
        if (!isNaN(x) && !isNaN(y)) {
            interactor.transition_to(vec.make([x, y]), interactor.zoom.get(), 3);
            // interactor.center.set();
            // Facet.Scene.invalidate();
        }
    });
    $(window).resize(function(eventObject) {
        if (!rb)
            return;
        var w = window.innerWidth;
        var h = window.innerHeight;
        interactor.resize(w, h);
        gl.resize(w, h);
        rb.resize(w, h);
        Facet.Scene.invalidate();
    });
    $("#greeting").click(function() {
        $("#greeting").fadeOut(500);
    });
    window.setTimeout(function() {
        $("#greeting").fadeOut(500);
    }, 15000);
}

$().ready(function() {
    pointsize = Shade.parameter("float", 2.5);
    pointweight = Shade.parameter("float", 0.5);
    init_gui();

    var canvas = document.getElementById("webgl");
    var width = window.innerWidth, height = window.innerHeight;
    canvas.width = width;
    canvas.height = height;

    interactor = Facet.UI.center_zoom_interactor({
        width: width, height: height, zoom: 2/3
    });

    $("#overview").click(function() { interactor.transition_to(vec.make([0, 0]), 0.8333, 3); });
    $("#fractal1").click(function() { interactor.transition_to(vec.make([-0.4501, -0.5069]), 15, 3); });
    $("#fractal2").click(function() { interactor.transition_to(vec.make([0.6601, -0.1711]), 9, 3); });
    $("#fractal3").click(function() { interactor.transition_to(vec.make([-1.5333, 0.2376]), 6, 3); });
    $("#fractal4").click(function() { interactor.transition_to(vec.make([-0.9129, 1.298]), 4, 3); });
    $("#squares").click(function() { interactor.transition_to(vec.make([0, 0.73]), 7, 3); });
    $("#eye1").click(function() { interactor.transition_to(vec.make([-1, 0]), 7, 3); });
    $("#eye2").click(function() { interactor.transition_to(vec.make([0, -1]), 20, 3); });
    $("#eye3").click(function() { interactor.transition_to(vec.make([-0.5, 0.8666]), 15, 3); });
    $("#eye4").click(function() { interactor.transition_to(vec.make([0.7071, -0.7071]), 15, 3); });

    interactor.center.watch(function(c) {
        $("#current-real").text(Math.round(c[0] * 10000) / 10000);
        $("#current-imag").text(Math.round(c[1] * 10000) / 10000);
        $("#plus-sign").css("display", c[1] >= 0 ? "" : "none");
    });

    gl = Facet.init(canvas, {
        clearDepth: 1.0,
        clearColor: [0,0,0,1],
        interactor: interactor,
        highDPS: false
    });

    Facet.Net.binary(["data/roots_real.raw", "data/roots_imag.raw"], function (obj) {
        var x = Facet.attribute_buffer({ vertex_array: new Float32Array(obj["data/roots_real.raw"]), item_size: 1});
        var y = Facet.attribute_buffer({ vertex_array: new Float32Array(obj["data/roots_imag.raw"]), item_size: 1});
        points_batch = make_points_batch(x, y, width, height);

        $("#loading").fadeOut(500);
        Facet.Scene.add(points_batch);
        Facet.Scene.invalidate();
    });
    Facet.Scene.invalidate();
});
