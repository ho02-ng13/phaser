//  Phaser.Physics.Arcade.World

var Body = require('./Body');
var Clamp = require('../../math/Clamp');
var Class = require('../../utils/Class');
var CONST = require('./const');
var DistanceBetween = require('../../math/distance/DistanceBetween');
var GetValue = require('../../utils/object/GetValue');
var PhysicsEvent = require('./events');
var Rectangle = require('../../geom/rectangle/Rectangle');
var RTree = require('../../structs/RTree');
var Set = require('../../structs/Set');
var Vector2 = require('../../math/Vector2');

var World = new Class({

    initialize:

    function World (scene, config)
    {
        this.scene = scene;

        this.events = scene.sys.events;

        this.bodies = new Set();

        this.gravity = new Vector2(GetValue(config, 'gravity.x', 0), GetValue(config, 'gravity.y', 0));

        this.bounds = new Rectangle(
            GetValue(config, 'x', 0),
            GetValue(config, 'y', 0),
            GetValue(config, 'width', scene.sys.game.config.width),
            GetValue(config, 'height', scene.sys.game.config.height)
        );

        this.checkCollision = {
            up: GetValue(config, 'checkCollision.up', true),
            down: GetValue(config, 'checkCollision.down', true),
            left: GetValue(config, 'checkCollision.left', true),
            right: GetValue(config, 'checkCollision.right', true)
        };

        this.OVERLAP_BIAS = GetValue(config, 'overlapBias', 4);

        this.forceX = GetValue(config, 'forceX', false);

        this.isPaused = GetValue(config, 'isPaused', false);

        this._total = 0;

        this.drawDebug = GetValue(config, 'debug', false);

        this.debugGraphic;

        this.defaults = {
            debugShowBody: GetValue(config, 'debugShowBody', true),
            debugShowVelocity: GetValue(config, 'debugShowVelocity', true),
            bodyDebugColor: GetValue(config, 'debugBodyColor', 0xff00ff),
            velocityDebugColor: GetValue(config, 'debugVelocityColor', 0x00ff00)
        };

        this.maxEntries = GetValue(config, 'maxEntries', 16);

        this.tree = new RTree(this.maxEntries, ['.left', '.top', '.right', '.bottom']);

        this.treeMinMax = { minX: 0, minY: 0, maxX: 0, maxY: 0 };

        if (this.drawDebug)
        {
            this.createDebugGraphic();
        }
    },

    createDebugGraphic: function ()
    {
        var graphic = this.scene.sys.add.graphics({ x: 0, y: 0 });

        graphic.setZ(Number.MAX_SAFE_INTEGER);

        this.debugGraphic = graphic;

        this.drawDebug = true;

        return graphic;
    },

    setBounds: function (x, y, width, height)
    {
        this.bounds.setTo(x, y, width, height);

        return this;
    },

    pause: function ()
    {
        this.isPaused = true;

        return this;
    },

    resume: function ()
    {
        this.isPaused = false;

        return this;
    },

    update: function (time, delta)
    {
        if (this.isPaused || this.bodies.size === 0)
        {
            return;
        }

        // this.delta = Math.min(delta / 1000, this.maxStep) * this.timeScale;
        delta /= 1000;

        this.delta = delta;

        //  Update all active bodies

        var i;
        var body;
        var bodies = this.bodies.entries;
        var len = bodies.length;

        for (i = 0; i < len; i++)
        {
            body = bodies[i];

            if (body.enable)
            {
                body.update(delta);
            }
        }

        //  Populate our collision tree
        this.tree.clear();
        this.tree.load(bodies);
    },

    postUpdate: function ()
    {
        var i;
        var body;
        var bodies = this.bodies.entries;
        var len = bodies.length;

        for (i = 0; i < len; i++)
        {
            body = bodies[i];

            if (body.enable)
            {
                body.postUpdate();
            }
        }

        if (this.drawDebug)
        {
            var graphics = this.debugGraphic;

            graphics.clear();

            for (i = 0; i < len; i++)
            {
                body = bodies[i];

                if (body.willDrawDebug())
                {
                    body.drawDebug(graphics);
                }
            }
        }
    },

    updateMotion: function (body)
    {
        if (body.allowRotation)
        {
            var velocityDelta = this.computeVelocity(0, body, body.angularVelocity, body.angularAcceleration, body.angularDrag, body.maxAngular) - body.angularVelocity;

            body.angularVelocity += velocityDelta;
            body.rotation += (body.angularVelocity * this.delta);
        }

        body.velocity.x = this.computeVelocity(1, body, body.velocity.x, body.acceleration.x, body.drag.x, body.maxVelocity.x);
        body.velocity.y = this.computeVelocity(2, body, body.velocity.y, body.acceleration.y, body.drag.y, body.maxVelocity.y);
    },

    computeVelocity: function (axis, body, velocity, acceleration, drag, max)
    {
        if (max === undefined) { max = 10000; }

        if (axis === 1 && body.allowGravity)
        {
            velocity += (this.gravity.x + body.gravity.x) * this.delta;
        }
        else if (axis === 2 && body.allowGravity)
        {
            velocity += (this.gravity.y + body.gravity.y) * this.delta;
        }

        if (acceleration)
        {
            velocity += acceleration * this.delta;
        }
        else if (drag && body.allowDrag)
        {
            drag *= this.delta;

            if (velocity - drag > 0)
            {
                velocity -= drag;
            }
            else if (velocity + drag < 0)
            {
                velocity += drag;
            }
            else
            {
                velocity = 0;
            }
        }

        if (velocity > max)
        {
            velocity = max;
        }
        else if (velocity < -max)
        {
            velocity = -max;
        }

        return velocity;
    },

    overlap: function (object1, object2, overlapCallback, processCallback, callbackContext)
    {
        if (overlapCallback === undefined) { overlapCallback = null; }
        if (processCallback === undefined) { processCallback = null; }
        if (callbackContext === undefined) { callbackContext = overlapCallback; }

        this._total = 0;

        this.collideObjects(object1, object2, overlapCallback, processCallback, callbackContext, true);

        return (this._total > 0);
    },

    collide: function (object1, object2, collideCallback, processCallback, callbackContext)
    {
        if (collideCallback === undefined) { collideCallback = null; }
        if (processCallback === undefined) { processCallback = null; }
        if (callbackContext === undefined) { callbackContext = collideCallback; }

        this._total = 0;

        this.collideObjects(object1, object2, collideCallback, processCallback, callbackContext, false);

        return (this._total > 0);
    },

    collideObjects: function (object1, object2, collideCallback, processCallback, callbackContext, overlapOnly)
    {
        var i;

        if (!Array.isArray(object1) && Array.isArray(object2))
        {
            for (i = 0; i < object2.length; i++)
            {
                if (!object2[i]) { continue; }

                this.collideHandler(object1, object2[i], collideCallback, processCallback, callbackContext, overlapOnly);
            }
        }
        else if (Array.isArray(object1) && !Array.isArray(object2))
        {
            for (i = 0; i < object1.length; i++)
            {
                if (!object1[i]) { continue; }

                this.collideHandler(object1[i], object2, collideCallback, processCallback, callbackContext, overlapOnly);
            }
        }
        else if (Array.isArray(object1) && Array.isArray(object2))
        {
            for (i = 0; i < object1.length; i++)
            {
                if (!object1[i]) { continue; }

                for (var j = 0; j < object2.length; j++)
                {
                    if (!object2[j]) { continue; }

                    this.collideHandler(object1[i], object2[j], collideCallback, processCallback, callbackContext, overlapOnly);
                }
            }
        }
        else
        {
            this.collideHandler(object1, object2, collideCallback, processCallback, callbackContext, overlapOnly);
        }
    },

    collideHandler: function (object1, object2, collideCallback, processCallback, callbackContext, overlapOnly)
    {
        //  Only collide valid objects
        if (object2 === undefined && object1.isParent)
        {
            return this.collideGroupVsSelf(object1, collideCallback, processCallback, callbackContext, overlapOnly);
        }

        //  If neither of the objects are set then bail out
        if (!object1 || !object2)
        {
            return;
        }

        //  A Body
        if (object1.body)
        {
            if (object2.body)
            {
                this.collideSpriteVsSprite(object1, object2, collideCallback, processCallback, callbackContext, overlapOnly);
            }
            else if (object2.isParent)
            {
                this.collideSpriteVsGroup(object1, object2, collideCallback, processCallback, callbackContext, overlapOnly);
            }
            else if (object2.isTilemap)
            {
                this.collideSpriteVsTilemapLayer(object1, object2, collideCallback, processCallback, callbackContext, overlapOnly);
            }
        }
        //  GROUPS
        else if (object.isParent)
        {
            if (object2.body)
            {
                this.collideSpriteVsGroup(object2, object1, collideCallback, processCallback, callbackContext, overlapOnly);
            }
            else if (object2.isParent)
            {
                this.collideGroupVsGroup(object1, object2, collideCallback, processCallback, callbackContext, overlapOnly);
            }
            else if (object2.isTilemap)
            {
                this.collideGroupVsTilemapLayer(object1, object2, collideCallback, processCallback, callbackContext, overlapOnly);
            }
        }
        //  TILEMAP LAYERS
        else if (object1.isTilemap)
        {
            if (object2.body)
            {
                this.collideSpriteVsTilemapLayer(object2, object1, collideCallback, processCallback, callbackContext, overlapOnly);
            }
            else if (object2.isParent)
            {
                this.collideGroupVsTilemapLayer(object2, object1, collideCallback, processCallback, callbackContext, overlapOnly);
            }
        }
    },

    collideSpriteVsSprite: function (sprite1, sprite2, collideCallback, processCallback, callbackContext, overlapOnly)
    {
        if (!sprite1.body || !sprite2.body)
        {
            return false;
        }

        if (this.separate(sprite1.body, sprite2.body, processCallback, callbackContext, overlapOnly))
        {
            if (collideCallback)
            {
                collideCallback.call(callbackContext, sprite1, sprite2);
            }

            this._total++;
        }

        return true;
    },

    collideGroupVsGroup: function (group1, group2, collideCallback, processCallback, callbackContext, overlapOnly)
    {
        if (group1.length === 0 || group2.length === 0)
        {
            return;
        }
    },

    collideSpriteVsGroup: function (sprite, group, collideCallback, processCallback, callbackContext, overlapOnly)
    {
        if (group.length === 0)
        {
            return;
        }

        var bodyA = sprite.body;

        //  Does sprite collide with anything?

        var minMax = this.treeMinMax;

        minMax.minX = bodyA.left;
        minMax.minY = bodyA.top;
        minMax.maxX = bodyA.right;
        minMax.maxY = bodyA.bottom;

        var results = this.tree.search(minMax);

        if (results.length < 2)
        {
            return;
        }

        var children = group.getChildren();

        for (var i = 0; i < children.length; i++)
        {
            var bodyB = children[i].body;

            if (!bodyB || bodyA === bodyB || results.indexOf(bodyB) === -1)
            {
                continue;
            }

            if (this.separate(bodyA, bodyB, processCallback, callbackContext, overlapOnly))
            {
                if (collideCallback)
                {
                    collideCallback.call(callbackContext, bodyA.gameObject, bodyB.gameObject);
                }

                this._total++;
            }
        }
    },

    separate: function (body1, body2, processCallback, callbackContext, overlapOnly)
    {
        if (
            !body1.enable ||
            !body2.enable ||
            body1.checkCollision.none ||
            body2.checkCollision.none ||
            !this.intersects(body1, body2))
        {
            return false;
        }

        //  They overlap. Is there a custom process callback? If it returns true then we can carry on, otherwise we should abort.
        if (processCallback && processCallback.call(callbackContext, body1.gameObject, body2.gameObject) === false)
        {
            return false;
        }

        //  Circle vs. Circle quick bail out
        if (body1.isCircle && body2.isCircle)
        {
            return this.separateCircle(body1, body2, overlapOnly);
        }

        // We define the behavior of bodies in a collision circle and rectangle
        // If a collision occurs in the corner points of the rectangle, the body behave like circles

        //  Either body1 or body2 is a circle
        if (body1.isCircle !== body2.isCircle)
        {
            var bodyRect = (body1.isCircle) ? body2 : body1;
            var bodyCircle = (body1.isCircle) ? body1 : body2;

            var rect = {
                x: bodyRect.x,
                y: bodyRect.y,
                right: bodyRect.right,
                bottom: bodyRect.bottom
            };

            var circle = bodyCircle.center;

            if (circle.y < rect.y || circle.y > rect.bottom)
            {
                if (circle.x < rect.x || circle.x > rect.right)
                {
                    return this.separateCircle(body1, body2, overlapOnly);
                }
            }
        }

        var resultX = false;
        var resultY = false;

        //  Do we separate on x or y first?
        if (this.forceX || Math.abs(this.gravity.y + body1.gravity.y) < Math.abs(this.gravity.x + body1.gravity.x))
        {
            resultX = this.separateX(body1, body2, overlapOnly);

            //  Are they still intersecting? Let's do the other axis then
            if (this.intersects(body1, body2))
            {
                resultY = this.separateY(body1, body2, overlapOnly);
            }
        }
        else
        {
            resultY = this.separateY(body1, body2, overlapOnly);

            //  Are they still intersecting? Let's do the other axis then
            if (this.intersects(body1, body2))
            {
                resultX = this.separateX(body1, body2, overlapOnly);
            }
        }

        var result = (resultX || resultY);

        if (result)
        {
            if (overlapOnly && (body1.onOverlap || body2.onOverlap))
            {
                this.events.dispatch(new PhysicsEvent.OVERLAP(body1.gameObject, body2.gameObject));
            }
            else if (body1.onCollide || body2.onCollide)
            {
                this.events.dispatch(new PhysicsEvent.COLLIDE(body1.gameObject, body2.gameObject));
            }
        }

        return result;
    },

    intersects: function (body1, body2)
    {
        if (body1 === body2)
        {
            return false;
        }

        if (body1.isCircle)
        {
            if (body2.isCircle)
            {
                //  Circle vs. Circle
                return DistanceBetween(body1.center.x, body1.center.y, body2.center.x, body2.center.y) <= (body1.halfWidth + body2.halfWidth);
            }
            else
            {
                //  Circle vs. Rect
                return this.circleBodyIntersects(body1, body2);
            }
        }
        else if (body2.isCircle)
        {
            //  Rect vs. Circle
            return this.circleBodyIntersects(body2, body1);
        }
        else
        {
            //  Rect vs. Rect
            if (body1.right <= body2.position.x)
            {
                return false;
            }

            if (body1.bottom <= body2.position.y)
            {
                return false;
            }

            if (body1.position.x >= body2.right)
            {
                return false;
            }

            if (body1.position.y >= body2.bottom)
            {
                return false;
            }

            return true;
        }
    },

    circleBodyIntersects: function (circle, body)
    {
        var x = Clamp(circle.center.x, body.left, body.right);
        var y = Clamp(circle.center.y, body.top, body.bottom);

        var dx = (circle.center.x - x) * (circle.center.x - x);
        var dy = (circle.center.y - y) * (circle.center.y - y);

        return (dx + dy) <= (circle.halfWidth * circle.halfWidth);
    },

    separateCircle: function (body1, body2, overlapOnly)
    {
        //  Set the bounding box overlap values
        this.getOverlapX(body1, body2);
        this.getOverlapY(body1, body2);

        var dx = body2.center.x - body1.center.x;
        var dy = body2.center.y - body1.center.y;

        var angleCollision = Math.atan2(dy, dx);

        var overlap = 0;

        if (body1.isCircle !== body2.isCircle)
        {
            var rect = {
                x: (body2.isCircle) ? body1.position.x : body2.position.x,
                y: (body2.isCircle) ? body1.position.y : body2.position.y,
                right: (body2.isCircle) ? body1.right : body2.right,
                bottom: (body2.isCircle) ? body1.bottom : body2.bottom
            };

            var circle = {
                x: (body1.isCircle) ? body1.center.x : body2.center.x,
                y: (body1.isCircle) ? body1.center.y : body2.center.y,
                radius: (body1.isCircle) ? body1.halfWidth : body2.halfWidth
            };

            if (circle.y < rect.y)
            {
                if (circle.x < rect.x)
                {
                    overlap = DistanceBetween(circle.x, circle.y, rect.x, rect.y) - circle.radius;
                }
                else if (circle.x > rect.right)
                {
                    overlap = DistanceBetween(circle.x, circle.y, rect.right, rect.y) - circle.radius;
                }
            }
            else if (circle.y > rect.bottom)
            {
                if (circle.x < rect.x)
                {
                    overlap = DistanceBetween(circle.x, circle.y, rect.x, rect.bottom) - circle.radius;
                }
                else if (circle.x > rect.right)
                {
                    overlap = DistanceBetween(circle.x, circle.y, rect.right, rect.bottom) - circle.radius;
                }
            }

            overlap *= -1;
        }
        else
        {
            overlap = (body1.halfWidth + body2.halfWidth) - DistanceBetween(body1.center.x, body1.center.y, body2.center.x, body2.center.y);
        }

        //  Can't separate two immovable bodies, or a body with its own custom separation logic
        if (overlapOnly || overlap === 0 || (body1.immovable && body2.immovable) || body1.customSeparateX || body2.customSeparateX)
        {
            if (overlap !== 0 && (body1.onOverlap || body2.onOverlap))
            {
                this.events.dispatch(new PhysicsEvent.OVERLAP(body1.gameObject, body2.gameObject));
            }

            //  return true if there was some overlap, otherwise false
            return (overlap !== 0);
        }

        // Transform the velocity vector to the coordinate system oriented along the direction of impact.
        // This is done to eliminate the vertical component of the velocity

        var b1vx = body1.velocity.x;
        var b1vy = body1.velocity.y;
        var b1mass = body1.mass;

        var b2vx = body2.velocity.x;
        var b2vy = body2.velocity.y;
        var b2mass = body2.mass;

        var v1 = {
            x: b1vx * Math.cos(angleCollision) + b1vy * Math.sin(angleCollision),
            y: b1vx * Math.sin(angleCollision) - b1vy * Math.cos(angleCollision)
        };

        var v2 = {
            x: b2vx * Math.cos(angleCollision) + b2vy * Math.sin(angleCollision),
            y: b2vx * Math.sin(angleCollision) - b2vy * Math.cos(angleCollision)
        };

        // We expect the new velocity after impact
        var tempVel1 = ((b1mass - b2mass) * v1.x + 2 * b2mass * v2.x) / (b1mass + b2mass);
        var tempVel2 = (2 * b1mass * v1.x + (b2mass - b1mass) * v2.x) / (b1mass + b2mass);

        // We convert the vector to the original coordinate system and multiplied by factor of rebound
        if (!body1.immovable)
        {
            body1.velocity.x = (tempVel1 * Math.cos(angleCollision) - v1.y * Math.sin(angleCollision)) * body1.bounce.x;
            body1.velocity.y = (v1.y * Math.cos(angleCollision) + tempVel1 * Math.sin(angleCollision)) * body1.bounce.y;

            //  Reset local var
            b1vx = body1.velocity.x;
            b1vy = body1.velocity.y;
        }

        if (!body2.immovable)
        {
            body2.velocity.x = (tempVel2 * Math.cos(angleCollision) - v2.y * Math.sin(angleCollision)) * body2.bounce.x;
            body2.velocity.y = (v2.y * Math.cos(angleCollision) + tempVel2 * Math.sin(angleCollision)) * body2.bounce.y;

            //  Reset local var
            b2vx = body2.velocity.x;
            b2vy = body2.velocity.y;
        }

        // When the collision angle is almost perpendicular to the total initial velocity vector
        // (collision on a tangent) vector direction can be determined incorrectly.
        // This code fixes the problem

        if (Math.abs(angleCollision) < Math.PI / 2)
        {
            if ((b1vx > 0) && !body1.immovable && (b2vx > b1vx))
            {
                body1.velocity.x *= -1;
            }
            else if ((b2vx < 0) && !body2.immovable && (b1vx < b2vx))
            {
                body2.velocity.x *= -1;
            }
            else if ((b1vy > 0) && !body1.immovable && (b2vy > b1vy))
            {
                body1.velocity.y *= -1;
            }
            else if ((b2vy < 0) && !body2.immovable && (b1vy < b2vy))
            {
                body2.velocity.y *= -1;
            }
        }
        else if (Math.abs(angleCollision) > Math.PI / 2)
        {
            if ((b1vx < 0) && !body1.immovable && (b2vx < b1vx))
            {
                body1.velocity.x *= -1;
            }
            else if ((b2vx > 0) && !body2.immovable && (b1vx > b2vx))
            {
                body2.velocity.x *= -1;
            }
            else if ((b1vy < 0) && !body1.immovable && (b2vy < b1vy))
            {
                body1.velocity.y *= -1;
            }
            else if ((b2vy > 0) && !body2.immovable && (b1vx > b2vy))
            {
                body2.velocity.y *= -1;
            }
        }

        if (!body1.immovable)
        {
            body1.x += (body1.velocity.x * this.delta) - overlap * Math.cos(angleCollision);
            body1.y += (body1.velocity.y * this.delta) - overlap * Math.sin(angleCollision);
        }

        if (!body2.immovable)
        {
            body2.x += (body2.velocity.x * this.delta) + overlap * Math.cos(angleCollision);
            body2.y += (body2.velocity.y * this.delta) + overlap * Math.sin(angleCollision);
        }

        if (body1.onCollide || body2.onCollide)
        {
            this.events.dispatch(new PhysicsEvent.COLLIDE(body1.gameObject, body2.gameObject));
        }

        return true;
    },

    getOverlapX: function (body1, body2, overlapOnly)
    {
        var overlap = 0;
        var maxOverlap = body1.deltaAbsX() + body2.deltaAbsX() + this.OVERLAP_BIAS;

        if (body1.deltaX() === 0 && body2.deltaX() === 0)
        {
            //  They overlap but neither of them are moving
            body1.embedded = true;
            body2.embedded = true;
        }
        else if (body1.deltaX() > body2.deltaX())
        {
            //  Body1 is moving right and / or Body2 is moving left
            overlap = body1.right - body2.x;

            if ((overlap > maxOverlap && !overlapOnly) || body1.checkCollision.right === false || body2.checkCollision.left === false)
            {
                overlap = 0;
            }
            else
            {
                body1.touching.none = false;
                body1.touching.right = true;
                body2.touching.none = false;
                body2.touching.left = true;
            }
        }
        else if (body1.deltaX() < body2.deltaX())
        {
            //  Body1 is moving left and/or Body2 is moving right
            overlap = body1.x - body2.width - body2.x;

            if ((-overlap > maxOverlap && !overlapOnly) || body1.checkCollision.left === false || body2.checkCollision.right === false)
            {
                overlap = 0;
            }
            else
            {
                body1.touching.none = false;
                body1.touching.left = true;
                body2.touching.none = false;
                body2.touching.right = true;
            }
        }

        //  Resets the overlapX to zero if there is no overlap, or to the actual pixel value if there is
        body1.overlapX = overlap;
        body2.overlapX = overlap;

        return overlap;
    },

    getOverlapY: function (body1, body2, overlapOnly)
    {
        var overlap = 0;
        var maxOverlap = body1.deltaAbsY() + body2.deltaAbsY() + this.OVERLAP_BIAS;

        if (body1.deltaY() === 0 && body2.deltaY() === 0)
        {
            //  They overlap but neither of them are moving
            body1.embedded = true;
            body2.embedded = true;
        }
        else if (body1.deltaY() > body2.deltaY())
        {
            //  Body1 is moving down and/or Body2 is moving up
            overlap = body1.bottom - body2.y;

            if ((overlap > maxOverlap && !overlapOnly) || body1.checkCollision.down === false || body2.checkCollision.up === false)
            {
                overlap = 0;
            }
            else
            {
                body1.touching.none = false;
                body1.touching.down = true;
                body2.touching.none = false;
                body2.touching.up = true;
            }
        }
        else if (body1.deltaY() < body2.deltaY())
        {
            //  Body1 is moving up and/or Body2 is moving down
            overlap = body1.y - body2.bottom;

            if ((-overlap > maxOverlap && !overlapOnly) || body1.checkCollision.up === false || body2.checkCollision.down === false)
            {
                overlap = 0;
            }
            else
            {
                body1.touching.none = false;
                body1.touching.up = true;
                body2.touching.none = false;
                body2.touching.down = true;
            }
        }

        //  Resets the overlapY to zero if there is no overlap, or to the actual pixel value if there is
        body1.overlapY = overlap;
        body2.overlapY = overlap;

        return overlap;
    },

    separateX: function (body1, body2, overlapOnly)
    {
        var overlap = this.getOverlapX(body1, body2, overlapOnly);

        //  Can't separate two immovable bodies, or a body with its own custom separation logic
        if (overlapOnly || overlap === 0 || (body1.immovable && body2.immovable) || body1.customSeparateX || body2.customSeparateX)
        {
            //  return true if there was some overlap, otherwise false
            return (overlap !== 0) || (body1.embedded && body2.embedded);
        }

        //  Adjust their positions and velocities accordingly (if there was any overlap)
        var v1 = body1.velocity.x;
        var v2 = body2.velocity.x;

        if (!body1.immovable && !body2.immovable)
        {
            overlap *= 0.5;

            body1.x -= overlap;
            body2.x += overlap;

            var nv1 = Math.sqrt((v2 * v2 * body2.mass) / body1.mass) * ((v2 > 0) ? 1 : -1);
            var nv2 = Math.sqrt((v1 * v1 * body1.mass) / body2.mass) * ((v1 > 0) ? 1 : -1);
            var avg = (nv1 + nv2) * 0.5;

            nv1 -= avg;
            nv2 -= avg;

            body1.velocity.x = avg + nv1 * body1.bounce.x;
            body2.velocity.x = avg + nv2 * body2.bounce.x;
        }
        else if (!body1.immovable)
        {
            body1.x -= overlap;
            body1.velocity.x = v2 - v1 * body1.bounce.x;

            //  This is special case code that handles things like vertically moving platforms you can ride
            if (body2.moves)
            {
                body1.y += (body2.y - body2.prev.y) * body2.friction.y;
            }
        }
        else
        {
            body2.x += overlap;
            body2.velocity.x = v1 - v2 * body2.bounce.x;

            //  This is special case code that handles things like vertically moving platforms you can ride
            if (body1.moves)
            {
                body2.y += (body1.y - body1.prev.y) * body1.friction.y;
            }
        }

        //  If we got this far then there WAS overlap, and separation is complete, so return true
        return true;
    },

    separateY: function (body1, body2, overlapOnly)
    {
        var overlap = this.getOverlapY(body1, body2, overlapOnly);

        //  Can't separate two immovable bodies, or a body with its own custom separation logic
        if (overlapOnly || overlap === 0 || (body1.immovable && body2.immovable) || body1.customSeparateY || body2.customSeparateY)
        {
            //  return true if there was some overlap, otherwise false
            return (overlap !== 0) || (body1.embedded && body2.embedded);
        }

        //  Adjust their positions and velocities accordingly (if there was any overlap)
        var v1 = body1.velocity.y;
        var v2 = body2.velocity.y;

        if (!body1.immovable && !body2.immovable)
        {
            overlap *= 0.5;

            body1.y -= overlap;
            body2.y += overlap;

            var nv1 = Math.sqrt((v2 * v2 * body2.mass) / body1.mass) * ((v2 > 0) ? 1 : -1);
            var nv2 = Math.sqrt((v1 * v1 * body1.mass) / body2.mass) * ((v1 > 0) ? 1 : -1);
            var avg = (nv1 + nv2) * 0.5;

            nv1 -= avg;
            nv2 -= avg;

            body1.velocity.y = avg + nv1 * body1.bounce.y;
            body2.velocity.y = avg + nv2 * body2.bounce.y;
        }
        else if (!body1.immovable)
        {
            body1.y -= overlap;
            body1.velocity.y = v2 - v1 * body1.bounce.y;

            //  This is special case code that handles things like horizontal moving platforms you can ride
            if (body2.moves)
            {
                body1.x += (body2.x - body2.prev.x) * body2.friction.x;
            }
        }
        else
        {
            body2.y += overlap;
            body2.velocity.y = v1 - v2 * body2.bounce.y;

            //  This is special case code that handles things like horizontal moving platforms you can ride
            if (body1.moves)
            {
                body2.x += (body1.x - body1.prev.x) * body1.friction.x;
            }
        }

        //  If we got this far then there WAS overlap, and separation is complete, so return true
        return true;
    },

    enable: function (object)
    {
        var i = 1;

        if (Array.isArray(object))
        {
            i = object.length;

            while (i--)
            {
                if (object[i].hasOwnProperty('children'))
                {
                    //  If it's a Group then we do it on the children regardless
                    this.enable(object[i].children.entries);
                }
                else
                {
                    this.enableBody(object[i]);
                }
            }
        }
        else if (object.hasOwnProperty('children'))
        {
            //  If it's a Group then we do it on the children regardless
            this.enable(object.children.entries);
        }
        else
        {
            this.enableBody(object);
        }
    },

    enableBody: function (object)
    {
        if (object.body === null)
        {
            object.body = new Body(this, object);

            this.bodies.set(object.body);
        }

        return object;
    },

    disable: function (object)
    {
        var i = 1;

        if (Array.isArray(object))
        {
            i = object.length;

            while (i--)
            {
                if (object[i].hasOwnProperty('children'))
                {
                    //  If it's a Group then we do it on the children regardless
                    this.disable(object[i].children.entries);
                }
                else
                {
                    this.disableBody(object[i]);
                }
            }
        }
        else if (object.hasOwnProperty('children'))
        {
            //  If it's a Group then we do it on the children regardless
            this.disable(object.children.entries);
        }
        else
        {
            this.disableBody(object);
        }
    },

    disableBody: function (object)
    {
        if (object.body)
        {
            this.bodies.delete(object.body);

            object.body.destroy();

            object.body = null;
        }

        return object;
    }

});

module.exports = World;
