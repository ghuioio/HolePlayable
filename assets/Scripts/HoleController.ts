
import {
    _decorator, Component, Node, Vec3,
    Collider, SphereCollider, ITriggerEvent,
    tween, input, Input, EventTouch,
    Camera, geometry, RigidBody, ERigidBodyType
} from 'cc';
import { WeaponItem } from './WeaponItem';
import { PHY_GROUP } from './PhysicsGroups';
const { ccclass, property } = _decorator;

@ccclass('HoleController')
export class HoleController extends Component {

    @property({ type: Camera })
    public mainCamera: Camera | null = null;

    @property({ type: Node })
    public visualPitNode: Node | null = null;

    public onWeaponConsumed: ((size: number) => void) | null = null;

    private _holeDiameter: number = 2.0;

    private static readonly DIAMETER_BY_LEVEL: number[] = [1.0, 1.5, 2.0];

    private _isDragging: boolean = false;
    private _targetPos: Vec3 = new Vec3();
    private _groundPlane = new geometry.Plane(0, 1, 0, 0.6);
    private _ray = new geometry.Ray();
    private _triggerCollider: SphereCollider | null = null;
    private _baseScaleY: number = 1;

    private _weaponsInZone: Set<WeaponItem> = new Set();

    private static readonly FALL_HOLD_TIME = 0.15;

    private _fallHoldTimers: Map<WeaponItem, number> = new Map();

    private _wobbleCooldowns: Map<string, number> = new Map();

    private static readonly ARENA_HALF = 7.5;

    public get holeDiameter() { return this._holeDiameter; }
    public get holeRadius() { return this._holeDiameter / 2; }

    onLoad() {
        this._baseScaleY = this.node.scale.y;
        this._holeDiameter = HoleController.DIAMETER_BY_LEVEL[1];
        this.node.setScale(new Vec3(this._holeDiameter, this._baseScaleY, this._holeDiameter));
        this._ensurePhysics();
        this._registerInput();
    }

    onDestroy() {
        this._unregisterInput();
    }

    update(dt: number) {
        if (this._isDragging) {
            const pos = this.node.worldPosition;
            const lerped = new Vec3();
            Vec3.lerp(lerped, pos, this._targetPos, Math.min(1, dt * 12));
            this.node.setWorldPosition(lerped);
        }

        const holeCenter = this.node.worldPosition;
        const holeRadius = this.holeRadius;

        this._weaponsInZone.forEach(weapon => {
            if (!weapon || !weapon.node || !weapon.node.isValid) {
                this._weaponsInZone.delete(weapon);
                this._fallHoldTimers.delete(weapon);
                return;
            }
            if (weapon.isSwallowing) {
                this._fallHoldTimers.delete(weapon);
                return;
            }

            const wp = weapon.node.worldPosition;
            const dx = wp.x - holeCenter.x;
            const dz = wp.z - holeCenter.z;
            const distXZ = Math.sqrt(dx * dx + dz * dz);

            if (weapon.boundingSize <= this._holeDiameter) {
                if (distXZ < holeRadius * 0.8) {
                    const held = (this._fallHoldTimers.get(weapon) ?? 0) + dt;
                    this._fallHoldTimers.set(weapon, held);
                    if (held >= HoleController.FALL_HOLD_TIME) {
                        this._fallHoldTimers.delete(weapon);
                        weapon.startFalling(holeCenter, holeRadius).then(() => {
                            if (this.onWeaponConsumed) {
                                this.onWeaponConsumed(weapon.boundingSize);
                            }
                        });
                    }
                } else {
                    this._fallHoldTimers.delete(weapon);
                }
            } else {
                if (distXZ < holeRadius + 0.5) {
                    const uid = weapon.node.uuid;
                    const cd = this._wobbleCooldowns.get(uid) || 0;
                    if (cd <= 0) {
                        weapon.applyEdgeWobble(holeCenter);
                        this._wobbleCooldowns.set(uid, 0.4);
                    }
                }
            }
        });

        this._wobbleCooldowns.forEach((val, key) => {
            const nv = val - dt;
            if (nv <= 0) this._wobbleCooldowns.delete(key);
            else this._wobbleCooldowns.set(key, nv);
        });
    }

    public upgrade(level: number) {
        this._holeDiameter = HoleController.DIAMETER_BY_LEVEL[level] ?? 4.4;

        tween(this.node)
            .to(0.5, { scale: new Vec3(this._holeDiameter, this._baseScaleY, this._holeDiameter) }, { easing: 'backOut' })
            .start();

        this._updateVisualPit();
    }

    private _updateVisualPit() {
        if (!this.visualPitNode) return;
        this.visualPitNode.setPosition(0, -0.1, 0);
    }

    private _ensurePhysics() {
        let rb = this.getComponent(RigidBody);
        if (!rb) {
            rb = this.node.addComponent(RigidBody);
        }
        rb.type = ERigidBodyType.KINEMATIC;

        rb.setGroup(PHY_GROUP.FUNNEL);
        rb.setMask(PHY_GROUP.WEAPON);

        let col = this.getComponent(SphereCollider);
        if (!col) {
            col = this.node.addComponent(SphereCollider);
            col.center = new Vec3(0, 0.5, 0);
        }
        col.radius = 0.5;
        col.isTrigger = true;
        this._triggerCollider = col;

        col.setGroup(PHY_GROUP.FUNNEL);
        col.setMask(PHY_GROUP.WEAPON);

        col.on('onTriggerEnter', this._onTriggerEnter, this);
        col.on('onTriggerExit', this._onTriggerExit, this);
    }

    private _onTriggerEnter(event: ITriggerEvent) {
        const weapon = this._findWeapon(event.otherCollider.node);
        if (weapon && !weapon.isSwallowing) {
            this._weaponsInZone.add(weapon);
        }
    }

    private _onTriggerExit(event: ITriggerEvent) {
        const weapon = this._findWeapon(event.otherCollider.node);
        if (!weapon) return;

        const cancelled = weapon.cancelFalling();
        if (cancelled || !weapon.isSwallowing) {
            this._weaponsInZone.delete(weapon);
            this._fallHoldTimers.delete(weapon);
        }
    }

    private _findWeapon(node: Node): WeaponItem | null {
        let current: Node | null = node;
        while (current) {
            const w = current.getComponent(WeaponItem);
            if (w) return w;
            current = current.parent;
        }
        return null;
    }

    private _registerInput() {
        input.on(Input.EventType.TOUCH_START, this._onTouchStart, this);
        input.on(Input.EventType.TOUCH_MOVE, this._onTouchMove, this);
        input.on(Input.EventType.TOUCH_END, this._onTouchEnd, this);
        input.on(Input.EventType.TOUCH_CANCEL, this._onTouchEnd, this);
    }

    private _unregisterInput() {
        input.off(Input.EventType.TOUCH_START, this._onTouchStart, this);
        input.off(Input.EventType.TOUCH_MOVE, this._onTouchMove, this);
        input.off(Input.EventType.TOUCH_END, this._onTouchEnd, this);
        input.off(Input.EventType.TOUCH_CANCEL, this._onTouchEnd, this);
    }

    private _onTouchStart(event: EventTouch) {
        this._isDragging = true;
        this._updateTargetFromTouch(event);
    }

    private _onTouchMove(event: EventTouch) {
        if (this._isDragging) this._updateTargetFromTouch(event);
    }

    private _onTouchEnd(_event: EventTouch) {
        this._isDragging = false;
    }

    private _updateTargetFromTouch(event: EventTouch) {
        if (!this.mainCamera) return;
        const loc = event.getLocation();
        this.mainCamera.screenPointToRay(loc.x, loc.y, this._ray);

        const dist = geometry.intersect.rayPlane(this._ray, this._groundPlane);
        if (dist > 0) {
            const hitPoint = new Vec3();
            this._ray.computeHit(hitPoint, dist);
            const half = HoleController.ARENA_HALF;
            hitPoint.x = Math.max(-half, Math.min(half, hitPoint.x));
            hitPoint.z = Math.max(-half, Math.min(half, hitPoint.z));
            hitPoint.y = -0.6;
            this._targetPos.set(hitPoint);
        }
    }
}
