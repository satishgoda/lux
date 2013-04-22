var gl;
var teapot;
var model_mat;
var Models = Lux.Models;
var angle;

//////////////////////////////////////////////////////////////////////////////

function draw_it()
{
    teapot.draw();
}

$().ready(function () {
    var canvas = document.getElementById("webgl");
    var camera = Shade.Camera.perspective({
        look_at: [Shade.vec(0, 2, 20), Shade.vec(0, 0, -1), Shade.vec(0, 1, 0)],
        field_of_view_y: 45,
        aspect_ratio: 720/480,
        near_distance: 0.1,
        far_distance: 100
    });
    angle = Shade.parameter("float");
    gl = Lux.init(canvas, {
        clearDepth: 1.0,
        clearColor: [0,0,0,0.2],
        display: draw_it,
        attributes: {
            alpha: true,
            depth: true
        }
    });
    var teapot_model = Models.teapot();

    var model_matrix = (Shade.rotation(0.3, Shade.vec(1,0,0)))(Shade.rotation(angle, Shade.vec(0,1,0)));
    var model_vertex = model_matrix.mul(teapot_model.vertex);

    teapot = Lux.bake(teapot_model, {
        position: camera(model_vertex),
        color: Shade.gl_light({
            light_position: Shade.vec(5,5,10),
            material_color: Shade.color("white"),
            light_ambient: Shade.vec(0.1, 0.1, 0.1, 1.0),
            light_diffuse: Shade.color("white"),
            vertex: model_vertex,
            normal: model_matrix(teapot_model.normal)
        })
    });

    var start = new Date().getTime();
    var f = function() {
        window.requestAnimFrame(f, canvas);
        var elapsed = new Date().getTime() - start;
        angle.set((elapsed / 20) * (Math.PI/180));
        gl.display();
    };
    f();
});
