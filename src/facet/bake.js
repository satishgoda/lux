(function() {

var previous_batch_opts = {};

Facet.unload_batch = function()
{
    if (!previous_batch_opts._ctx)
        return;
    var ctx = previous_batch_opts._ctx;
    if (previous_batch_opts.attributes) {
        for (var key in previous_batch_opts.attributes) {
            ctx.disableVertexAttribArray(previous_batch_opts.program[key]);
        }
        _.each(previous_batch_opts.program.uniforms, function (uniform) {
            delete uniform._facet_active_uniform;
        });
    }
    // FIXME setting line width belongs somewhere else, but I'm not quite sure where.
    // resets line width
    if (previous_batch_opts.line_width)
        ctx.lineWidth(1.0);

    // reset the opengl capabilities which are determined by
    // Facet.DrawingMode.*
    ctx.disable(ctx.DEPTH_TEST);
    ctx.disable(ctx.BLEND);
    ctx.depthMask(true);

    previous_batch_opts = {};
};

function draw_it(batch_opts)
{
    if (_.isUndefined(batch_opts))
        throw "drawing mode undefined";

    if (batch_opts.batch_id !== previous_batch_opts.batch_id) {
        var attributes = batch_opts.attributes || {};
        var uniforms = batch_opts.uniforms || {};
        var program = batch_opts.program;
        var primitives = batch_opts.primitives;
        var key;

        Facet.unload_batch();
        previous_batch_opts = batch_opts;
        batch_opts.set_caps();

        var ctx = batch_opts._ctx;
        ctx.useProgram(program);

        for (key in attributes) {
            var attr = program[key];
            if (!_.isUndefined(attr)) {
                ctx.enableVertexAttribArray(attr);
                attributes[key].bind(attr);
            }
        }
        
        var currentActiveTexture = 0;
        _.each(program.uniforms, function(uniform) {
            var key = uniform.uniform_name;
            var call = uniform.uniform_call,
                value = uniform.get();
            if (_.isUndefined(value)) {
                throw "parameter " + key + " has not been set.";
            }
            var t = facet_constant_type(value);
            if (t === "other") {
                uniform._facet_active_uniform = (function(uid, cat) {
                    return function(v) {
                        ctx.activeTexture(ctx.TEXTURE0 + cat);
                        ctx.bindTexture(ctx.TEXTURE_2D, v);
                        ctx.uniform1i(uid, cat);
                    };
                })(program[key], currentActiveTexture);
                currentActiveTexture++;
            } else if (t === "number" || t === "vector" || t === "boolean") {
                uniform._facet_active_uniform = (function(call, uid) {
                    return function(v) {
                        call.call(ctx, uid, v);
                    };
                })(ctx[call], program[key]);
            } else if (t === "matrix") {
                uniform._facet_active_uniform = (function(call, uid) {
                    return function(v) {
                        ctx[call](uid, false, v);
                    };
                })(call, program[key]);
            } else {
                throw "could not figure out parameter type! " + t;
            }
            uniform._facet_active_uniform(value);
        });
    }

    batch_opts.draw_chunk();
}

var largest_batch_id = 1;

Facet.bake = function(model, appearance, opts)
{
    opts = _.defaults(opts || {}, {
        force_no_draw: false,
        force_no_pick: false,
        force_no_unproject: false
    });

    appearance = Shade.canonicalize_program_object(appearance);

    if (_.isUndefined(appearance.gl_FragColor)) {
        appearance.gl_FragColor = Shade.vec(1,1,1,1);
    }

    // these are necessary outputs which must be compiled by Shade.program
    function is_program_output(key)
    {
        return ["color", "position", "point_size",
                "gl_FragColor", "gl_Position", "gl_PointSize"].indexOf(key) != -1;
    };

    if (appearance.gl_Position.type.equals(Shade.Types.vec2)) {
        appearance.gl_Position = Shade.vec(appearance.gl_Position, 0, 1);
    } else if (appearance.gl_Position.type.equals(Shade.Types.vec3)) {
        appearance.gl_Position = Shade.vec(appearance.gl_Position, 1);
    } else if (!appearance.gl_Position.type.equals(Shade.Types.vec4)) {
        throw "position appearance attribute must be vec2, vec3 or vec4";
    }

    var ctx = model._ctx || Facet._globals.ctx;

    var batch_id = Facet.fresh_pick_id();

    function build_attribute_arrays_obj(prog) {
        return _.build(_.map(
            prog.attribute_buffers, function(v) { return [v._shade_name, v]; }
        ));
    }

    function process_appearance(val_key_function) {
        var result = {};
        _.each(appearance, function(value, key) {
            if (is_program_output(key)) {
                result[key] = val_key_function(value, key);
            }
        });
        return Shade.program(result);
    }

    function create_draw_program() {
        return process_appearance(function(value, key) {
            return value;
        });
    }

    function create_pick_program() {
        var pick_id;
        if (appearance.pick_id)
            pick_id = Shade(appearance.pick_id);
        else {
            pick_id = Shade(Shade.id(batch_id));
        }
        return process_appearance(function(value, key) {
            if (key === 'gl_FragColor') {
                var pick_if = (appearance.pick_if || 
                               Shade(value).swizzle("a").gt(0));
                return pick_id.discard_if(Shade.not(pick_if));
            } else
                return value;
        });
    }

    /* Facet unprojecting uses the render-as-depth technique suggested
     by Benedetto et al. in the SpiderGL paper in the context of
     shadow mapping:

     SpiderGL: A JavaScript 3D Graphics Library for Next-Generation
     WWW

     Marco Di Benedetto, Federico Ponchio, Fabio Ganovelli, Roberto
     Scopigno. Visual Computing Lab, ISTI-CNR

     http://vcg.isti.cnr.it/Publications/2010/DPGS10/spidergl.pdf

     FIXME: Perhaps there should be an option of doing this directly as
     render-to-float-texture.

     */
    
    function create_unproject_program() {
        return process_appearance(function(value, key) {
            if (key === 'gl_FragColor') {
                var position_z = appearance.gl_Position.swizzle('z'),
                    position_w = appearance.gl_Position.swizzle('w');
                var normalized_z = position_z.div(position_w).add(1).div(2);

                // normalized_z ranges from 0 to 1.

                // an opengl z-buffer actually stores information as
                // 1/z, so that more precision is spent on the close part
                // of the depth range. Here, we are storing z, and so our efficiency won't be great.
                // 
                // However, even 1/z is only an approximation to the ideal scenario, and 
                // if we're already doing this computation on a shader, it might be worthwhile to use
                // Thatcher Ulrich's suggestion about constant relative precision using 
                // a logarithmic mapping:

                // http://tulrich.com/geekstuff/log_depth_buffer.txt

                // This mapping, incidentally, is more directly interpretable as
                // linear interpolation in log space.

                var result_rgba = Shade.vec(
                    normalized_z,
                    normalized_z.mul(1 << 8),
                    normalized_z.mul(1 << 16),
                    normalized_z.mul(1 << 24)
                );
                return result_rgba;
            } else
                return value;
        });
    }

    var primitive_types = {
        points: ctx.POINTS,
        line_strip: ctx.LINE_STRIP,
        line_loop: ctx.LINE_LOOP,
        lines: ctx.LINES,
        triangle_strip: ctx.TRIANGLE_STRIP,
        triangle_fan: ctx.TRIANGLE_FAN,
        triangles: ctx.TRIANGLES
    };

    var primitive_type = primitive_types[model.type];
    var elements = model.elements;
    var draw_chunk;
    if (facet_typeOf(elements) === 'number') {
        draw_chunk = function() {
            ctx.drawArrays(primitive_type, 0, elements);
        };
    } else {
        draw_chunk = function() {
            elements.bind_and_draw(elements, primitive_type);
        };
    }
    var primitives = [primitive_types[model.type], model.elements];

    // FIXME the batch_id field in the batch_opts objects is not
    // the same as the batch_id in the batch itself. 
    // 
    // The former is used to avoid state switching, while the latter is
    // a generic automatic id which might be used for picking, for
    // example.
    // 
    // This should not lead to any problems right now but might be confusing to
    // readers.

    function create_batch_opts(program, caps_name) {
        var result = {
            _ctx: ctx,
            program: program,
            attributes: build_attribute_arrays_obj(program),
            set_caps: function() {
                var ctx = Facet._globals.ctx;
                var mode_caps = ((appearance.mode && appearance.mode[caps_name]) ||
                       Facet.DrawingMode.standard[caps_name]);
                mode_caps();
                if (this.line_width) {
                    ctx.lineWidth(this.line_width);
                }
            },
            draw_chunk: draw_chunk,
            batch_id: largest_batch_id++
        };
        if (appearance.line_width)
            result.line_width = appearance.line_width;
        return result;
    }

    var draw_opts, pick_opts, unproject_opts;

    if (!opts.force_no_draw)
        draw_opts = create_batch_opts(create_draw_program(), "set_draw_caps");

    if (!opts.force_no_pick)
        pick_opts = create_batch_opts(create_pick_program(), "set_pick_caps");

    if (!opts.force_no_unproject)
        unproject_opts = create_batch_opts(create_unproject_program(), "set_unproject_caps");

    var which_opts = [ draw_opts, pick_opts, unproject_opts ];

    var result = {
        batch_id: batch_id,
        draw: function() {
            draw_it(which_opts[ctx._facet_globals.batch_render_mode]);
        },
        // in case you want to force the behavior, or that
        // single array lookup is too slow for you.
        _draw: function() {
            draw_it(draw_opts);
        },
        _pick: function() {
            draw_it(pick_opts);
        }
    };
    return result;
};
})();
