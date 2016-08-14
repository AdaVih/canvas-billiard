/**
 * 物理引擎
 * @author Simon
 * @create 2016-08-12
 */

class Engine {
    /**
     * 构造函数
     * @method constructor
     * @param  {Element}    canvas
     */
    constructor(canvas) {
        this.entities = [];
        this.entitySet = {};
        this._onRun = false;
        this._timmer = 0;
        this.canvas = canvas;
        this.ct = canvas.getContext('2d');
        this.laws = [];
        this.mouse = this.getCursor(canvas);
    }

    /**
     * 向当前画布添加 实体
     * - 实体须继承自Base
     * - 参数为实体对象构成的数组
     * - 副作用: 参数被加上'__GUID'属性
     * @method add
     * @param  {Array(Base) | Base} ent 要添加的实体列表
     */
    add(ent) {
        let GUID = this.__getID();
        this.entities = this.entities.concat(ent);
        ent['__GUID'] =  GUID;
        this.entitySet[GUID] = ent;
        return ent;
    }

    /**
     * 删除被标记为dead的实体
     * - 副作用: 直接修改了上面add的传入值
     * @method clean
     */
    clean() {
        this.entities = this.entities.filter(entity => !entity.dead);
        Object.keys(this.entitySet).map(key => {
            let toDel = this.entitySet[key].map((entity, index) => entity.dead ? index : false).filter(key => key !== false);
            toDel.map(index => this.entitySet[key].splice(index, 1));
        });
    }

    /**
     * 开始运行
     * @method run
     */
    run() {
        // 轮回 !!!
        const samsara = () => {
            // 清空画布
            this.ct.save();
            this.ct.clearRect(0, 0, this.canvas.width, this.canvas.height);
            this.ct.restore();

            // 绘制当前实体
            this.entities.map(entity => entity.draw(this.ct));
            this.laws.map(law => {
                law();
            });
            // 执行每个实体自己的动作
            this.entities.map(entity => entity.action || entity.action());
            // 执行运动
            this.entities.map(entity => {
                if (!entity.__catched) {
                    entity.move();
                }
            });

            this.timmer = window.requestAnimationFrame(samsara);
        }
        this.timmer = window.requestAnimationFrame(samsara);
        // this.timmer = window.setInterval(samsara, 5);
    }

    /**
     * 添加物理定律
     * 在每个轮回(每一帧)运行
     * @method addLaw
     */
    addLaw(law) {
        // this.laws.push([ent, law]);
        this.laws.push(law);
    }

    /**
     * 两个实体之间的碰撞检测
     * @method ifCollide
     * @param  {Bounds}  objBounds0 A物体的边界
     * @param  {Bounds}  objBounds1 B物体的边界
     * @return {Bool}
     */
    ifCollide (objBounds0, objBounds1) {
        if (objBounds0.type === 'arc' && objBounds1.type === 'arc') { // 判断圆心距离
            return Math.sqrt(
                    Math.pow(objBounds0.x - objBounds1.x, 2) +
                    Math.pow(objBounds0.y - objBounds1.y, 2)
                   ) <= objBounds0.radius + objBounds1.radius;
        }
    }

    /**
     * 检查实体列表中每两个实体之间的碰撞情况,
     * 若碰撞, 则调用回调, 参数为碰撞的两个实体
     * @method checkCollition
     * @param  {Array(Base)}   entities 实体列表
     * @param  {Fun}           cbk      回调函数
     */
    checkCollition(entities, cbk) {
        for (let i = 0; i < entities.length - 1; i++) {
            let entity = entities[i];
            for (var j = i + 1; j < entities.length; j++) {
                let nextEntity = entities[j]
                if (this.ifCollide(entity.getBounds(), nextEntity.getBounds())) {
                    console.log('collition');
                    // 画出碰撞辅助线
                    this.ct.save();
                    this.ct.beginPath();
                    this.ct.moveTo(entity.x, entity.y);
                    this.ct.strokeStyle = 'green';
                    this.ct.lineWidth = 1;
                    this.ct.lineTo(nextEntity.x, nextEntity.y);
                    this.ct.stroke();
                    this.ct.restore();
                    // 回调
                    cbk(entity, nextEntity);
                }
            }
        }
    }

    /**
     * 若A和B相交, 则直接调整两者位置, 以退回相切的位置
     * - 副作用: 直接修改传入实体的x,y属性
     * @method noCross
     */
    noCross(A, B) {
        let distance = Math.sqrt(Math.pow(B.x - A.x, 2) + Math.pow(B.y - A.y, 2));
        if (A.radius + B.radius > distance) {
            // 重合了
            this.ct.save();
            this.ct.beginPath();
            this.ct.moveTo(A.x, A.y);
            this.ct.strokeStyle = 'yellow';
            this.ct.lineWidth = 1;
            this.ct.lineTo(B.x, B.y);
            this.ct.stroke();
            this.ct.restore();

            let central = {
                x: (A.x * A.radius + B.x * B.radius) / (A.radius + B.radius),
                y: (A.y * A.radius + B.y * B.radius) / (A.radius + B.radius) ,
            }
            // 需要移动的距离, 先不考虑两个球移动的距离应该不同
            let d = (A.radius + B.radius - distance) / 2;
            // 夹角
            let beta = Math.atan2(B.y - A.y, B.x - A.x);
            let dx = Math.cos(beta) * d;
            let dy = Math.sin(beta) * d;
            A.x -= dx * 1.05;
            A.y -= dy * 1.05;
            B.x += dx * 1.05;
            B.y += dy * 1.05;
        }
    }

    /**
     * 弹性碰撞模型
     * 符合动量守恒/动能守恒的任意角度弹性碰撞模型
     * - 副作用: 直接修改传入实体的vx,vy属性
     * @method elasticImpact
     * @param  {Base}      A
     * @param  {Base}      B
     */
    elasticImpact(A, B) {
        // ** 连线方向正碰
        // 连线方向矢量
        const X = [B.x - A.x, B.y - A.y];
        const lenX = Math.sqrt(Math.pow(X[0], 2) + Math.pow(X[1], 2)); // 连线向量长度
        // 连线方向上的速度
        let vAX = ((A.vx*X[0] + 0*X[1]) / lenX) + ((0*X[0] + A.vy*X[1]) / lenX);
        let vBX = ((B.vx*X[0] + 0*X[1]) / lenX) + ((0*X[0] + B.vy*X[1]) / lenX);
        let vAXN = ((A.m - B.m) * vAX + 2 * B.m * vBX) / (A.m + B.m);
        let vBXN = (2 * A.m * vAX + (B.m - A.m) * vBX) / (A.m + B.m);
        // ** 切面方向v不变
        // 切线方向矢量
        let Y = [1, -X[0]/X[1]]; // 随便设一个, 垂直就好
        // ---- 这里有个大bug: 如果切线垂直(lenY = Infinity)呢
        let lenY = Math.sqrt(Math.pow(Y[0], 2) + Math.pow(Y[1], 2)); // 切线向量长度
        if (lenY > 99999999) {
            lenY = 1;
            Y = [0, 1];
        };
        // 切线方向上的速度
        let vAY = ((A.vx*Y[0] + 0*Y[1]) / lenY) + ((0*Y[0] + A.vy*Y[1]) / lenY);
        let vBY = ((B.vx*Y[0] + 0*Y[1]) / lenY) + ((0*Y[0] + B.vy*Y[1]) / lenY);
        // ** 合成新速度
        // 连线方向上的新速度是标量, 方向与X相同, 现在映射到x, y上
        const oX = Math.atan2(X[1], X[0]);// 连线与x轴的夹角
        const oY = Math.atan2(Y[1], Y[0]);// 切线与x轴的夹角
        let mapxA = vAXN * Math.cos(oX) + vAY * Math.cos(oY);
        let mapyA = vAXN * Math.sin(oX) + vAY * Math.sin(oY); // 正负问题?
        let mapxB = vBXN * Math.cos(oX) + vBY * Math.cos(oY);
        let mapyB = vBXN * Math.sin(oX) + vBY * Math.sin(oY); // 正负问题?

        if (isNaN(mapxA)) {
            A.fillStyle = 'red';
            B.fillStyle = 'yellow';
            console.log(mapxA, mapyA, mapxB, mapyB);
        }

        A.vx = isNaN(mapxA) ? 0 : mapxA;
        A.vy = isNaN(mapyA) ? 0 : mapyA;
        B.vx = isNaN(mapxB) ? 0 : mapxB;
        B.vy = isNaN(mapyB) ? 0 : mapyB;
    }

    /**
     * 检测点是否落在边界内
     * @method ifPointIn
     * @param  {{x,y}}   point     点坐标
     * @param  {Bounds}  objBounds 边界
     * @return {Bool}
     */
    ifPointIn(point, objBounds) {
        if (objBounds.type === 'arc') { // 判断圆心距离
            return this.getDistance(point, objBounds) <= objBounds.radius;
        }
    }

    /**
     * 获取鼠标对象, 并实时更新
     * @method getCursor
     * @param  {Element}  elm 要监控的元素
     * @return {Mouse}
     */
    getCursor(elm) {
        let mouse = {
            x:0, // 鼠标x(相对于传入元素)
            y:0, // 鼠标y(相对于传入元素)
            down:false, // 鼠标按下状态
            lockOn:null, // 鼠标点击锁定, 避免速度过快移出物体造成拖动丢失
            justClicked: false, // 用于表明鼠标刚刚点击, 还没有移动, 用于区分 内部移动 和 外部点击后 移入内部
        };
        // addEventListener 如果重复, 重复的会被自动抛弃, 不用担心多次执行
        elm.addEventListener('mousemove', (event) => {
            mouse.x = event.clientX +
                        document.body.scrollLeft +
                        document.documentElement.scrollLeft -
                        elm.offsetLeft;
            mouse.y = event.clientY +
                        document.body.scrollTop +
                        document.documentElement.scrollTop -
                        elm.offsetTop;
            mouse.justClicked = false;
        }, false);

        elm.addEventListener('mousedown', (event) => {
            mouse.down = true;
            mouse.justClicked = true;
        }, false);

        elm.addEventListener('mouseup', (event) => {
            mouse.down = false;
            mouse.lockOn = null;
            mouse.justClicked = false;
        }, false);

        elm.addEventListener('mouseout', (event) => {
            mouse.down = false;
            mouse.lockOn = null;
            mouse.justClicked = false;
        }, false);

        return mouse;
    }

    /**
     * 拖拽
     * *** 解决鼠标各种点击情况
     * - 点击空白然后移入
     * - 点中然后速度过快移出
     * - 移出区域
     * @param  {Base}  监控的元素
     * @param  {Fun}   拖拽发生时进行的操作
     * @param  {Bool}  点击过程中是否禁止物体移动
     */
    __draftBase(entity, move, ifCatch) {
        ifCatch = ifCatch && true;
        let ifIn = this.ifPointIn(this.mouse, entity.getBounds());
        if (ifIn && this.mouse.down && this.mouse.justClicked) {
            this.mouse.lockOn = entity;
            entity.__catched = ifCatch;
        }
        if (this.mouse.down && this.mouse.lockOn === entity) {
            move(entity);
        }
        else {
            entity.__catched = false;
        }
    }

    /**
     * 简单拖拽, 直接改变被拖拽物体的坐标
     * @method draftSimple
     * @param  {Base}  监控的实体
     */
    draftSimple(entity) {
        this.__draftBase(entity, entity => {
            entity.x = this.mouse.x;
            entity.y = this.mouse.y;
        }, true)
    }

    /**
     * 缓动拖拽(牵拉), 直接改变被拖拽物体的速度
     * @method draftEase
     * @param  {Base}  被监控实体
     * @param  {Float} 缓动系数
     * @param  {[Canvas]} 可选, 用于绘制牵引线
     */
    draftEase(entity, easing, ct) {
        this.__draftBase(entity, entity => {
            entity.vx = (this.mouse.x - entity.x) * easing;
            entity.vy = (this.mouse.y - entity.y) * easing;
            if (ct) {
                ct.save();
                ct.beginPath();
                ct.strokeStyle = 'red';
                ct.lineWidth = 1;
                ct.moveTo(entity.x, entity.y);
                ct.lineTo(this.mouse.x, this.mouse.y);
                ct.stroke();
                ct.restore();
            }
        }, false)
    }

    /**
     * 弹弓模型(反向拉橡皮筋)
     * @method bungee
     * @param  {Base} 被监控的实体
     * @param  {Float} 弹性系数
     * @param  {Float} 橡皮筋长度极限, 超过这个极限则不满足胡克定律
     * @param  {[Canvas]} 可选, 用于绘制橡皮筋和瞄准线
     */
    bungee(entity, elastane, edge, ct) {
        this.__draftBase(entity, entity => {
            // 运动中的物体进制上弹簧
            if ((entity.vx < 0.5 && entity.vy < 0.5 && entity.ay < 0.5 && entity.ay < 0.5) || entity.__catched) {
                // 绘制弹簧和瞄准线
                if (ct) {
                    ct.save();
                    ct.beginPath();
                    ct.strokeStyle = '#0091EA';
                    ct.lineWidth = 2;
                    ct.moveTo(entity.x, entity.y);
                    ct.lineTo(this.mouse.x, this.mouse.y);
                    ct.stroke();
                    ct.beginPath();
                    ct.moveTo(entity.x, entity.y);
                    ct.setLineDash([4, 2]); // 线段长, 空隙长
                    ct.lineDashOffset = 0; // 起始位置偏移量
                    ct.strokeStyle = '#2979FF';
                    ct.lineWidth = 1;
                    ct.lineTo(entity.x - (this.mouse.x - entity.x)*3, entity.y - (this.mouse.y - entity.y)*3);
                    ct.stroke();
                    ct.restore();
                }
                let len = this.getDistance(entity, this.mouse)
                if (len > edge) {
                    elastane = elastane / (len/edge);
                }
                entity.vx = (entity.x - this.mouse.x) * elastane * 0.1;
                entity.vy = (entity.y - this.mouse.y) * elastane * 0.1;
            }
        }, true)
    }

    /**
     * 获取两点距离
     * @method getDistance
     * @param  {{x,y}}    A点
     * @param  {{x,y}}    B点
     * @return {Float}    距离
     */
    getDistance(A, B) {
        return Math.sqrt(Math.pow(A.x - B.x, 2) + Math.pow(A.y - B.y, 2));
    }

    /**
     * 生成简化的GUID
     * @method __getID
     * @return {String}
     */
    __getID(){
        let d = new Date().getTime();
        return 'xxxxxxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            let r = (d + Math.random()*16)%16 | 0;
            d = Math.floor(d/16);
            return (c=='x' ? r : (r&0x7|0x8)).toString(16);
        });
    };
}
