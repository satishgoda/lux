/*
 A range expression represents a finite stream of values. 

 It is meant
 to be an abstraction over looping, and provides a few ways to combine values.

 Currently the only operations supported are plain stream
 transformations (like "map") and fold (like "reduce").

 It should be possible to add, at the very least, "filter", "scan", and "firstWhich".

 nb: nested loops will require deep changes to the infrastructure, and
 won't be supported for a while.

 In general, looping in general is pretty unstable.
*/

(function() {

Shade.loop_variable = function(type, force_no_declare)
{
    return Shade._create_concrete_exp({
        parents: [],
        type: type,
        expression_type: "loop_variable",
        evaluate: function() {
            return this.glsl_name;
        },
        compile: function() {
            if (_.isUndefined(force_no_declare))
                this.scope.add_declaration(type.declare(this.glsl_name));
        },
        loop_variable_dependencies: Shade.memoize_on_field("_loop_variable_dependencies", function () {
            return [this];
        })
    });
};

function BasicRange(range_begin, range_end, value)
{
    this.begin = Shade.make(range_begin).as_int();
    this.end = Shade.make(range_end).as_int();
    this.value = value || function(index) { return index; };
};

Shade.range = function(range_begin, range_end, value)
{
    return new BasicRange(range_begin, range_end, value);
};

BasicRange.prototype.transform = function(xform)
{
    var that = this;
    return Shade.range(
        this.begin,
        this.end, 
        function (i) {
            var input = that.value(i);
            var result = xform(input);
            return result;
        });
};

BasicRange.prototype.fold = Shade(function(operation, starting_value)
{
    var index_variable = Shade.loop_variable(Shade.Types.int_t, true);
    var accumulator_value = Shade.loop_variable(starting_value.type, true);

    var element_value = this.value(index_variable);
    var result_type = accumulator_value.type;
    var operation_value = operation(accumulator_value, element_value);

    var result = Shade._create_concrete_exp({
        has_scope: true,
        patch_scope: function() {
            var index_variable = this.parents[2];
            var accumulator_value = this.parents[3];
            var element_value = this.parents[4];
            var that = this;
            
            _.each(element_value.sorted_sub_expressions(), function(node) {
                if (_.any(node.loop_variable_dependencies(), function(dep) {
                    return dep.glsl_name === index_variable.glsl_name ||
                        dep.glsl_name === accumulator_value.glsl_name;
                })) {
                    node.scope = that.scope;
                };
            });
        },
        parents: [this.begin, this.end, 
                  index_variable, accumulator_value, element_value,
                  starting_value, operation_value],
        type: result_type,
        element: Shade.memoize_on_field("_element", function(i) {
            if (this.type.is_pod()) {
                if (i === 0)
                    return this;
                else
                    throw this.type.repr() + " is an atomic type";
            } else
                return this.at(i);
        }),
        loop_variable_dependencies: Shade.memoize_on_field("_loop_variable_dependencies", function () {
            return [];
        }),
        compile: function(ctx) {
            var beg = this.parents[0];
            var end = this.parents[1];
            var index_variable = this.parents[2];
            var accumulator_value = this.parents[3];
            var element_value = this.parents[4];
            var starting_value = this.parents[5];
            var operation_value = this.parents[6];

            ctx.strings.push(this.type.repr(), this.glsl_name, "() {\n");
            ctx.strings.push("    ",accumulator_value.type.repr(), accumulator_value.glsl_name, "=", starting_value.evaluate(), ";\n");

            ctx.strings.push("    for (int",
                             index_variable.evaluate(),"=",beg.evaluate(),";",
                             index_variable.evaluate(),"<",end.evaluate(),";",
                             "++",index_variable.evaluate(),") {\n");
            _.each(this.scope.declarations, function(exp) {
                ctx.strings.push("        ", exp, ";\n");
            });
            _.each(this.scope.initializations, function(exp) {
                ctx.strings.push("        ", exp, ";\n");
            });
            ctx.strings.push("        ",
                             accumulator_value.evaluate(),"=",
                             operation_value.evaluate() + ";\n");
            ctx.strings.push("    }\n");
            ctx.strings.push("    return", 
                             this.type.repr(), "(", accumulator_value.evaluate(), ");\n");
            ctx.strings.push("}\n");
        }
    });

    return result;
});

BasicRange.prototype.sum = function()
{
    var this_begin_v = this.value(this.begin);
    return this.fold(Shade.add, this_begin_v.type.zero);
};

BasicRange.prototype.max = function()
{
    var this_begin_v = this.value(this.begin);
    return this.fold(Shade.max, this_begin_v.type.minus_infinity);
};

BasicRange.prototype.average = function()
{
    var s = this.sum();
    if (s.type.equals(Shade.Types.int_t)) {
        s = s.as_float();
    }
    return s.div(this.end.sub(this.begin).as_float());
};

})();
