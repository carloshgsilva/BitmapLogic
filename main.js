var canvas = document.getElementsByTagName('canvas')[0];
var gl = canvas.getContext('webgl2', {antialias: true});

//Initialize canvas
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

const GLSL_VERTEX = `#version 300 es
    precision highp float;

    //vec4(posx, posy, scale, aspectRatio)
    uniform vec4 uCamera;

    layout(location = 0) in vec2 inPos;
    out vec2 uv;

    void main(){
        uv = inPos*0.5+0.5;
        uv.y = 1.0-uv.y;
        gl_Position = vec4((inPos*vec2(1.0, uCamera.w)+uCamera.xy*2.0)*uCamera.z, 0.0, 1.0);
    }
`;
const GLSL_FRAGMENT = `#version 300 es
    precision highp usampler2D;
    precision highp float;
    precision highp int;

    in vec2 uv;
    out vec4 outColor;

    uniform sampler2D uColor;
    uniform usampler2D uPointer; //Contains the raw (x,y) of uState
    uniform sampler2D uState;

    void main(){
        ivec2 coords = ivec2(texture(uPointer, uv).xy);
        float state = texelFetch(uState, coords, 0).r;
        
        //Debug Pointers
        #if 0
            float seed = float(coords.x*32141+coords.y*3214);
            vec3 dbgColor = vec3(abs(fract(sin(seed*321.0123))), abs(fract(sin(seed*37.34))), abs(fract(sin(seed*34.213))));
            outColor = vec4(dbgColor, 1.0);
        #else
            outColor = vec4(texture(uColor, uv).rgb*(state*0.6+0.4), 1.0);
        #endif
    }
`;
class Renderer{
    constructor(){

        //Create Shaders
        this.vertexShader = this.compileShader(GLSL_VERTEX, gl.VERTEX_SHADER);
        this.fragmentShader = this.compileShader(GLSL_FRAGMENT, gl.FRAGMENT_SHADER);

        //Create ShaderProgram
        this.shaderProgram = gl.createProgram();
        gl.attachShader(this.shaderProgram, this.vertexShader);
        gl.attachShader(this.shaderProgram, this.fragmentShader);
        gl.linkProgram(this.shaderProgram);
        if(!gl.getProgramParameter(this.shaderProgram, gl.LINK_STATUS)){
            throw Error(gl.getProgramInfoLog(this.shaderProgram));
        }
        
        //Bind Textures Slots
        gl.useProgram(this.shaderProgram);
        gl.uniform1i(gl.getUniformLocation(this.shaderProgram, "uColor"), 0);
        gl.uniform1i(gl.getUniformLocation(this.shaderProgram, "uPointer"),  1);
        gl.uniform1i(gl.getUniformLocation(this.shaderProgram, "uState"), 2);

        //Create FullScreen Quad VBO (don't need to store it because we always use it)
        const dataBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, dataBuffer);
        const data = new Float32Array([
            -1.0, 1.0,
            1.0, 1.0,
            -1.0,-1.0,

            1.0, 1.0,
            1.0,-1.0,
            -1.0,-1.0,
        ]);
        gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(0);

        //First Resize
        this.resize();
    }

    compileShader(source, type){
        let shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
    
        if(!gl.getShaderParameter(shader, gl.COMPILE_STATUS)){
            var error = gl.getShaderInfoLog(shader);
            var line = parseInt(error.split(":")[2]);
            var sourceLines = source.split('\n');

            console.log(sourceLines.slice(line-5, line-1).join('\n'));
            console.error(sourceLines[line-1]);
            console.log(sourceLines.slice(line, line+3).join('\n'));
    
            throw Error(error);
        }
        return shader;
    }

    resize(){
        this.width = canvas.width;
        this.height = canvas.height;
        gl.viewport(0,0,this.width, this.height);
    }
    /**
     * 
     * @param {LogicData} logicData 
     * @param {Camera} camera 
     */
    render(logicData, camera){
        gl.clearColor(0.05,0.05,0.05,1);
        gl.clear(gl.COLOR_BUFFER_BIT);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, logicData.colorTexture);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, logicData.pointerTexture);
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, logicData.stateTexture);
        gl.uniform4f(gl.getUniformLocation(this.shaderProgram, "uCamera"), -camera.position[0], camera.position[1], camera.scale, camera.aspectRatio);
        
        gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
}

/*
Stores all the necessary data for displaying logic
1. ColorTexture(r,g,b,a) - The color of the wire
2. PointerTexture(x,y)   - Contains the offset x and y of the wireState
3. WireStateTexture(s)   - 255 if the wire is active
*/
const WIRE_STATE_SIZE = 256;
class LogicData{
    constructor(size){

        this.size = size;
        this.color = new Uint8Array(size*size*4);
        for(var i=0;i<this.color.length;i+=4){
            this.color[i+3] = 255;
        }

        //Color
        this.colorTexture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.colorTexture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, this.color);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

        //Pointer
        this.pointer = new Uint8Array(size*size*2);
        this.pointerTexture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.pointerTexture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG8UI, size, size, 0, gl.RG_INTEGER, gl.UNSIGNED_BYTE, this.pointer);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

        //State
        this.state = new Uint8Array(WIRE_STATE_SIZE*WIRE_STATE_SIZE);
        this.stateTexture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.stateTexture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, WIRE_STATE_SIZE, WIRE_STATE_SIZE, 0, gl.RED, gl.UNSIGNED_BYTE, this.state);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

        //LastState (Used in execution)
        this.lastState = this.state.slice(); //Copy it
    }
    flipLastState(){
        this.lastState = this.state.slice();
    }
    getColor(x, y){
        var start = (x + y*this.size)*4;
        return this.color.slice(start, start+4);
    }
    setColor(x, y, color){
        var i = (x + y*this.size)*4;
        this.color[i+0] = color[0];
        this.color[i+1] = color[1];
        this.color[i+2] = color[2];
        this.color[i+3] = color[3];
    }
    getPointer(x, y){
        var start = (x + y*this.size)*2;
        return this.pointer.slice(start, start+2);
    }
    setPointer(x, y, pointer){
        var i = (x + y*this.size)*2;
        this.pointer[i+0] = pointer[0];
        this.pointer[i+1] = pointer[1];
    }
    getState(x, y){
        return this.state[x+y*WIRE_STATE_SIZE];
    }
    setState(x, y, state){
        this.state[x+y*WIRE_STATE_SIZE] = state;
    }
    getLastState(x, y){
        return this.lastState[x+y*WIRE_STATE_SIZE];
    }
    setLastState(x, y, state){
        this.lastState[x+y*WIRE_STATE_SIZE] = state;
    }
    

    updateColor(){
        gl.bindTexture(gl.TEXTURE_2D, this.colorTexture);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, this.size, this.size, gl.RGBA, gl.UNSIGNED_BYTE, this.color);
    }
    updatePointer(){
        gl.bindTexture(gl.TEXTURE_2D, this.pointerTexture);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, this.size, this.size, gl.RG_INTEGER, gl.UNSIGNED_BYTE, this.pointer);
    }
    updateState(){
        gl.bindTexture(gl.TEXTURE_2D, this.stateTexture);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, WIRE_STATE_SIZE, WIRE_STATE_SIZE, gl.RED, gl.UNSIGNED_BYTE, this.state);
    }
}

class Logic{
    constructor(){
        this.size = 64;
        this.data = new LogicData(this.size);
        this.notGates = [];
        this.mapWires();
    }
    
    setShowState(){
        this.data.state.fill(255);
        this.data.updateState();
    }
    step(stepCount){
        for(var i=0;i<stepCount;i++){
            this.data.flipLastState();
            this.data.state.fill(0);
            /*
            for(var i=0;i<this.data.state.length;i++){
                this.data.state[i] = Math.random() < 0.5 ? 0 : 255;
            }
            */
            //Apply not gates
            for(var not of this.notGates){
                var src = not[0];
                var dst = not[1];
                if(this.data.getLastState(src[0], src[1]) == 0){
                    this.data.setState(dst[0], dst[1], 255);
                    this.data.setLastState(dst[0], dst[1], 255);
                }
            }
        }
        this.data.updateState();
    }

    mapWires(){
        //Reset Pointers
        this.data.pointer.fill(0);
        //Reset States
        this.data.state.fill(0);

        //Map Wires
        var pointer = [1, 0]; //Pointer [0, 0] is null
        var toSearchSpots = [];
        for(var x = 0;x<this.size;x++){
            for(var y = 0;y<this.size;y++){

                //Check Current Wire
                if(this.isWireAndNotMapped(x, y)){
                    toSearchSpots.push([x, y]);
                }else{
                    continue;
                }

                //While there is wire in the stack, set the wire pointer
                while(toSearchSpots.length > 0){
                    var p = toSearchSpots.pop();
                    this.data.setPointer(p[0], p[1], pointer);

                    //Check neighbours
                    if(this.isWireAndNotMapped(p[0]+1, p[1]+0)){ toSearchSpots.push([p[0]+1, p[1]+0]); }
                    if(this.isWireAndNotMapped(p[0]-1, p[1]+0)){ toSearchSpots.push([p[0]-1, p[1]+0]); }
                    if(this.isWireAndNotMapped(p[0]+0, p[1]+1)){ toSearchSpots.push([p[0]+0, p[1]+1]); }
                    if(this.isWireAndNotMapped(p[0]+0, p[1]-1)){ toSearchSpots.push([p[0]+0, p[1]-1]); }

                    //Cross Wires
                    if(this.isCross(p[0]+1, p[1]) && !this.isPointer(p[0]+2, p[1], pointer)){ toSearchSpots.push([p[0]+2, p[1]]); }
                    if(this.isCross(p[0]-1, p[1]) && !this.isPointer(p[0]-2, p[1], pointer)){ toSearchSpots.push([p[0]-2, p[1]]); }
                    if(this.isCross(p[0], p[1]+1) && !this.isPointer(p[0], p[1]+2, pointer)){ toSearchSpots.push([p[0], p[1]+2]); }
                    if(this.isCross(p[0], p[1]-1) && !this.isPointer(p[0], p[1]-2, pointer)){ toSearchSpots.push([p[0], p[1]-2]); }
                }

                //Increase Pointer
                pointer[0]++;
                if(pointer[0] >= WIRE_STATE_SIZE){
                    pointer[0] = 0;
                    pointer[1]++;
                    if(pointer[1] >= WIRE_STATE_SIZE){
                        throw new Error("Out of wire space! Should consider using short instead of byte for pointers.");
                    }
                }
            }
        }

        /*
        //Find Cross
        var remmapedPointers = [];
        for(var x = 0;x<this.size-2;x++){
            for(var y = 0;y<this.size-2;y++){
                var isACross = this.isWire(x+1, y) && this.isWire(x, y+1) && this.isWire(x+1, y+2) && this.isWire(x+2, y+1) && !this.isWire(x+1, y+1);
                var topLeft = this.isWire(x, y);
                var topRight = this.isWire(x+2, y);
                var bottomLeft = this.isWire(x, y+2);
                var bottomRight = this.isWire(x+2, y+2);

                //Corners Empty
                if(isACross && !topLeft && !topRight && !bottomLeft && !bottomRight){
                    function isRemapped(x, y){

                    }

                    var isLeftRemaped = 
                    this.remapCrossWires(x+1, y+2, this.data.getPointer(x+1, y));
                    this.remapCrossWires(x+2, y+1, this.data.getPointer(x, y+1));
                }
            }
        }
        */

        function shuffleArray(array) {
            for (var i = array.length - 1; i > 0; i--) {
                var j = Math.floor(Math.random() * (i + 1));
                var temp = array[i];
                array[i] = array[j];
                array[j] = temp;
            }
        }
        shuffleArray(this.notGates);

        //Find Not Gates
        this.notGates = [];
        this.wireCross = [];
        for(var x = 0;x<this.size-2;x++){
            for(var y = 0;y<this.size-2;y++){
                //Is a Cross
                var isACross = this.isWire(x+1, y) && this.isWire(x, y+1) && this.isWire(x+1, y+2) && this.isWire(x+2, y+1) && !this.isWire(x+1, y+1);
                if(isACross){
                    var topLeft = this.isWire(x, y);
                    var topRight = this.isWire(x+2, y);
                    var bottomLeft = this.isWire(x, y+2);
                    var bottomRight = this.isWire(x+2, y+2);

                    //Down
                    if(topLeft && topRight && !bottomLeft && !bottomRight){
                        this.notGates.push([this.data.getPointer(x, y), this.data.getPointer(x+1, y+2)]);
                    }
                    //Up
                    else if(!topLeft && !topRight && bottomLeft && bottomRight){
                        this.notGates.push([this.data.getPointer(x, y+1), this.data.getPointer(x+1, y)]);
                    }
                    //Right
                    else if(topLeft && !topRight && bottomLeft && !bottomRight){
                        this.notGates.push([this.data.getPointer(x, y), this.data.getPointer(x+2, y+1)]);
                    }
                    //Left
                    else if(!topLeft && topRight && !bottomLeft && bottomRight){
                        this.notGates.push([this.data.getPointer(x+1, y), this.data.getPointer(x, y+1)]);
                    }
                    //Cross
                    else if(!topLeft && !topRight && !bottomLeft && !bottomRight){
                        //this.remapCrossWires(x+1, y+2, this.data.getPointer(x+1, y));
                        //this.remapCrossWires(x+2, y+1, this.data.getPointer(x, y+1));
                    }
                }
            }
        }

        
        
        this.data.updatePointer();
        this.data.updateState();
    }
    isWireAndNotMapped(x, y){
        return this.isWire(x,y) && !this.isMapped(x, y);
    }
    isWire(x, y){
        var color = this.data.getColor(x,y);
        return color[0] > 223 || color[1] > 223 || color[2] > 223;
    }
    isMapped(x, y){
        var pointer = this.data.getPointer(x, y);
        return pointer[0] != 0 || pointer[1] != 0;
    }
    isPointer(x, y, pointer){
        if(x < 0 || y < 0 || x >= this.size || y >= this.size)return false;
        var cPointer = this.data.getPointer(x, y);
        return cPointer[0] == pointer[0] && cPointer[1] == pointer[1];
    }
    isWireAndNotPointer(x, y, pointer){
        if(x < 0 || y < 0 || x >= this.size || y >= this.size)return false;
        return this.isWire(x, y) && !this.isPointer(x, y, pointer);
    }
    isCross(x, y){
        if(!this.isWire(x, y) && //Center
            this.isWire(x+1, y) && this.isWire(x-1, y) && this.isWire(x, y+1) && this.isWire(x, y-1) && //Cross
           !this.isWire(x-1, y-1) && !this.isWire(x+1, y-1) && !this.isWire(x+1, y+1) && !this.isWire(x-1, y+1) //Corners
        ){
            return true;
        }
        return false;
    }
    remapCrossWires(x, y, newPointer){
        var wireStack = [[x, y]];

        while(wireStack.length > 0){
            var p = wireStack.pop();
            this.data.setPointer(p[0], p[1], newPointer);

            //Check neighbours
            if(this.isWireAndNotPointer(p[0]+1, p[1]+0, newPointer)){ wireStack.push([p[0]+1, p[1]+0]); }
            if(this.isWireAndNotPointer(p[0]-1, p[1]+0, newPointer)){ wireStack.push([p[0]-1, p[1]+0]); }
            if(this.isWireAndNotPointer(p[0]+0, p[1]+1, newPointer)){ wireStack.push([p[0]+0, p[1]+1]); }
            if(this.isWireAndNotPointer(p[0]+0, p[1]-1, newPointer)){ wireStack.push([p[0]+0, p[1]-1]); }
        }
    }

    loadFromImageData(imageData){
        if(imageData.width != imageData.height){
            alert("Only square images supported!");
            return;
        }
        this.size = imageData.width;

        this.data = new LogicData(this.size);
        this.data.color = Uint8Array.from(imageData.data);
        this.data.updateColor();
        this.mapWires();
    }

    loadFromUrl(url){
        ImageDataFromURL(url, (data)=>this.loadFromImageData(data));
    }

    render(){
        
    }
}

class Camera{
    constructor(){
        this.isDragging = false;
        this.position = [0, 0];
        this.scale = 1.0;
        this.aspectRatio = canvas.width/canvas.height;
        this.width = canvas.width;
        this.height = canvas.height;
        window.addEventListener('resize', e=>{
            console.log("Canvas resize")
            this.width = window.innerWidth;
            this.height = window.innerHeight;
            this.aspectRatio = this.width/this.height;
        });
        canvas.addEventListener('wheel', (e)=>{
            this.lastScale = this.scale;
            this.scale *= 1.0-e.deltaY*0.003;
            if(this.scale < 0.5){
                deltaFactor = this.scale/0.5;
                this.scale = 0.5;
            }
            if(this.scale > 16.0){
                deltaFactor = this.scale/5.0;
                this.scale = 16.0;
            }
            
            var deltaFactor = this.scale/this.lastScale;

        });
        canvas.addEventListener('mousedown', (e)=>{
            if(e.button == 1)this.isDragging = true;
        });
        canvas.addEventListener('mouseup', (e)=>{
            if(e.button == 1)this.isDragging = false;
        });
        canvas.addEventListener('mousemove', (e)=>{
            if(this.isDragging){
                this.position[0] -= (e.movementX/this.width)/this.scale;
                this.position[1] -= (e.movementY/this.height)/this.scale;
            }
        });
    }
    screenToWorld(sx, sy){
        var x = ((2.0*sx/this.width-1.0)/this.scale + this.position[0]*2.0)*0.5 + 0.5;
        var y = ((2.0*sy/this.height-1.0)/this.scale + this.position[1]*2.0)/this.aspectRatio*0.5 + 0.5;
        return [x, y];
    }
}

class Editor{
    constructor(logic){
        this.logic = logic;
        this.running = false;
        this.tool = "paint";
        this.color = [255,255,255,255];
        this.mouseDown = -1;
        this.lastMouseX = 0;
        this.lastMouseY = 0;
        logic.setShowState();

        //Callbacks
        window.addEventListener('keypress', e=>{
            e.preventDefault();

            switch(e.key){
                case " ": logic.step(1); break;
                case "1": this.tool = "paint"; this.updateToolbar(); break;
                case "2": this.tool = "pick"; this.updateToolbar(); break;
                case "3": document.getElementById('colorpicker').click(); break;
            }
        })
        canvas.addEventListener('mousedown', (e)=>{
            e.preventDefault();
            e.target.focus();
        
            if(e.button == 1){
                return;
            }

            var ws = camera.screenToWorld(e.offsetX, e.offsetY);
            var x = Math.floor(ws[0]*logic.size);
            var y = Math.floor(ws[1]*logic.size);
            
            this.lastMouseX = x;
            this.lastMouseY = y;


            this.mouseDown = e.button;
            this.mouseAction(x, y);
        });
        canvas.addEventListener('mousemove', (e)=>{
            var ws = camera.screenToWorld(e.offsetX, e.offsetY);
            var x = Math.floor(ws[0]*logic.size);
            var y = Math.floor(ws[1]*logic.size);
            this.mouseAction(x, y);
        });
        canvas.addEventListener('mouseup', (e)=>{
            this.mouseDown = -1;
        });

        //Pick Color Event Handler
        document.getElementById('colorpicker').addEventListener('input', e=>{
            this.color = this.hexColorToArray(e.target.value);
        })

        //Start Loop
        requestAnimationFrame(this.loop.bind(this));
    }
    loop(){
        if(this.running){
            this.logic.step(1);

            //Set the State each step
            var p = logic.data.getPointer(this.lastMouseX, this.lastMouseY);
            
            //If the pointer is not empty
            if(p[0]!=0||p[1]!=0){
                logic.data.setState(p[0], p[1], this.mouseDown == 0 ? 255 : 0 );
                logic.data.updateState();
            }
        }

        requestAnimationFrame(this.loop.bind(this));
    }
    mouseAction(x, y){
        if(this.mouseDown == -1)return;

        if(!this.running){
            if(this.tool == "paint"){
                logic.data.setColor(x, y, this.mouseDown == 0 ? this.color : [0,0,0,255]);
                logic.data.updateColor();
            }else if(this.tool == "pick"){
                this.color = logic.data.getColor(x, y);
                this.updateToolbar();
            }
        }
    }
    onToolbarButton(e){
        if(e.id == "playpause"){
            this.running = !this.running;

            //Hide Edit Toolbar
            if(this.running){
                document.getElementById("edit-toolbar").classList.add("hidden");
                logic.mapWires();
            }else{
                document.getElementById("edit-toolbar").classList.remove("hidden");
                logic.setShowState();
            }

            //Set Correct Icon
            document.getElementById("playpause").innerHTML = this.running ? "◼" : "▶";
        }else{
            this.tool = e.id;
            this.updateToolbar();
        }
    }
    ordTofixed2Hex(n){
        var s = n.toString(16);
        if(s.length == 1) s = "0"+s;
        return s;
    }
    hexColorToArray(hex){
        return [parseInt(hex.slice(1,3), 16), parseInt(hex.slice(3,5), 16), parseInt(hex.slice(5,7), 16), 255];
    }
    updateToolbar(){
        document.getElementById("paint").classList.toggle("selected", this.tool == "paint");
        document.getElementById("pick").classList.toggle("selected", this.tool == "pick");
        document.getElementById("colorpicker").value = "#"+this.ordTofixed2Hex(this.color[0])+this.ordTofixed2Hex(this.color[1])+this.ordTofixed2Hex(this.color[2]);
    }
}

var camera = new Camera();
var logic = new Logic();
var renderer = new Renderer();
var editor = new Editor(logic);

var lastTime = 0;
function mainLoop(time){
    var dt = time-lastTime;

    renderer.render(logic.data, camera);

    lastTime = time;
    //camera.renderWorld(logic);
    requestAnimationFrame(mainLoop);
}
requestAnimationFrame(mainLoop);



//Controls callbacks
window.onresize = function(e){
    var w = window.innerWidth;
    var h = window.innerHeight;
    canvas.width = w;
    canvas.height = h;
    renderer.resize();
}


//Toolbar
function toolbarButton(element){
    editor.onToolbarButton(element);
}

//Prevent Right Click Context menu
window.addEventListener('contextmenu', (e)=>{
    e.preventDefault();
});

//Handle File Load
document.getElementsByTagName('input')[0].addEventListener('input', (e)=>{
    var fr = new FileReader();
    fr.addEventListener('load', (e)=>{
        logic.loadFromUrl(e.target.result);
    });
    fr.readAsDataURL(e.target.files[0]);
});
function ImageDataFromURL(url, callback){
    var img = document.createElement('img');
    img.crossOrigin = "Anonymous";
    var canvas = document.createElement('canvas');
    var c = canvas.getContext('2d');
    img.onload = ()=>{
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        c.drawImage(img, 0, 0);
        callback(c.getImageData(0, 0, canvas.width, canvas.height));
        document.getElementById('dragdropfile').classList.remove('full');
    }
    img.src = url;
}

//Drag And Drop
window.addEventListener('dragleave', e=>{
    if(e.target.tagName != 'CANVAS'){
        document.getElementById('dragdropfile').classList.remove('full');
    }
});
window.addEventListener('dragover', e=>{
    document.getElementById('dragdropfile').value = null;
    document.getElementById('dragdropfile').classList.add('full');
});