
import {
    _decorator, Component, Node, Vec3, Enum,
    RigidBody, Collider, BoxCollider, SphereCollider,
    ERigidBodyType
} from 'cc';
import { PHY_GROUP, WEAPON_MASK_RESTING, WEAPON_MASK_FALLING, BLOCK_MASK_DYNAMIC } from './PhysicsGroups';
const { ccclass, property } = _decorator;

enum WeaponState {
    RESTING = 0,
    FALLING = 1,
    CONSUMED = 2,
}

@ccclass('WeaponItem')
export class WeaponItem extends Component {

    @property
    public boundingSize: number = 0;

    @property
    public mass: number = 1;

    @property
    public startsStatic: boolean = true;

    private _state: WeaponState = WeaponState.RESTING;
    private _holeCenter: Vec3 = new Vec3();
    private _holeRadius: number = 1.0;
    private _fallTimer: number = 0;
    private _abyssTimer: number = 0;
    private _abyssImpulseFired: boolean = false;
    private _resolveConsume: (() => void) | null = null;

    private static readonly ABYSS_DELAY = 0.05;
    private static readonly ABYSS_IMPULSE = 30;

    public get isSwallowing() { return this._state >= WeaponState.FALLING; }

    start() {
        if (this.boundingSize <= 0) {
            this.boundingSize = this._calcBoundingSize();
        }

        const rb = this.getComponent(RigidBody);
        if (this.startsStatic) {
            this._applyPhysicsGroup(WEAPON_MASK_RESTING);
            if (rb) {
                rb.type = ERigidBodyType.STATIC;
            }
        } else {
            this._applyPhysicsGroup(BLOCK_MASK_DYNAMIC);
            if (rb) {
                rb.type = ERigidBodyType.DYNAMIC;
                rb.useGravity = true;
            }
        }
    }

    update(dt: number) {
        if (this._state !== WeaponState.FALLING) return;
        this._fallTimer += dt;

        const pos = this.node.worldPosition;
        const rb = this.getComponent(RigidBody);

        if (!this._abyssImpulseFired) {
            this._abyssTimer += dt;
            if (this._abyssTimer >= WeaponItem.ABYSS_DELAY) {
                this._abyssImpulseFired = true;
                if (rb) {
                    rb.applyImpulse(new Vec3(0, -WeaponItem.ABYSS_IMPULSE, 0));
                }
            }
        }

        if (rb && !this._abyssImpulseFired && pos.y > -0.5) {
            const toCenter = new Vec3();
            Vec3.subtract(toCenter, this._holeCenter, pos);
            toCenter.y = 0;
            const hDist = toCenter.length();
            if (hDist > 0.05) {
                toCenter.normalize();
                const funnelStrength = Math.min(hDist, 0.6) * 0.4;
                toCenter.multiplyScalar(funnelStrength);
                rb.applyForce(toCenter);
            }
        }

        if (pos.y < -1.5 || this._fallTimer > 3) {
            this._state = WeaponState.CONSUMED;
            if (this._resolveConsume) this._resolveConsume();
            this.node.destroy();
        }
    }

    public startFalling(holeCenter: Vec3, holeRadius: number = 1.0): Promise<void> {
        if (this._state >= WeaponState.FALLING) return Promise.resolve();

        if (this.node.children.length > 5) {
            console.warn(`[WeaponItem] startFalling aborted on "${this.node.name}": has ${this.node.children.length} children — likely a container, not a weapon.`);
            return Promise.resolve();
        }

        this._state = WeaponState.FALLING;
        this._holeCenter.set(holeCenter);
        this._holeRadius = holeRadius;

        this._activateBlockAbove();

        return new Promise<void>((resolve) => {
            this._resolveConsume = resolve;

            this._applyPhysicsGroup(WEAPON_MASK_FALLING);

            const rb = this.getComponent(RigidBody);
            if (rb) {
                rb.type = ERigidBodyType.DYNAMIC;

                rb.useGravity = true;
                rb.gravityScale = 8;

                rb.linearDamping = 0;
                rb.angularDamping = 0.05;

                rb.angularFactor = new Vec3(1, 1, 1);

                rb.setLinearVelocity(new Vec3(0, -5, 0));

                this._applyTangentTorque(rb);

                rb.applyTorque(new Vec3(
                    (Math.random() - 0.5) * 4,
                    (Math.random() - 0.5) * 1,
                    (Math.random() - 0.5) * 4
                ));
            }
        });
    }

    public makeDynamic() {
        if (this._state !== WeaponState.RESTING) return;
        this._applyPhysicsGroup(BLOCK_MASK_DYNAMIC);
        const rb = this.getComponent(RigidBody);
        if (rb) {
            rb.type = ERigidBodyType.DYNAMIC;
            rb.useGravity = true;
        }
        this._activateBlockAbove();
    }

    private _activateBlockAbove() {
        const myPos = this.node.worldPosition;
        const parent = this.node.parent;
        if (!parent) return;

        for (const sibling of parent.children) {
            if (sibling === this.node) continue;
            const weapon = sibling.getComponent(WeaponItem);
            if (!weapon || weapon.isSwallowing) continue;

            const sp = sibling.worldPosition;
            const dx = Math.abs(sp.x - myPos.x);
            const dy = sp.y - myPos.y;
            const dz = Math.abs(sp.z - myPos.z);

            if (dx < 0.1 && dz < 0.1 && dy > 0.8 && dy < 1.2) {
                weapon.makeDynamic();
                break;
            }
        }
    }

    public cancelFalling(): boolean {
        if (this._state !== WeaponState.FALLING) return false;

        if (this._abyssImpulseFired) return false;

        const pos = this.node.worldPosition;
        if (pos.y < 0.0) return false;

        const rb = this.getComponent(RigidBody);
        if (rb) {
            const vel = new Vec3();
            rb.getLinearVelocity(vel);
            if (vel.y < -1.0) return false;
        }

        this._state = WeaponState.RESTING;
        this._resolveConsume = null;
        this._abyssTimer = 0;
        this._fallTimer = 0;
        this._abyssImpulseFired = false;

        this._applyPhysicsGroup(WEAPON_MASK_RESTING);

        if (rb) {
            rb.type = ERigidBodyType.STATIC;
            rb.gravityScale = 1;
            rb.angularFactor = new Vec3(0, 1, 0);
            rb.linearDamping = 0.5;
            rb.angularDamping = 0.95;
            rb.setLinearVelocity(Vec3.ZERO);
            rb.setAngularVelocity(Vec3.ZERO);
        }

        if (pos.y < 0.5) {
            const resetPos = new Vec3(pos.x, 0.5, pos.z);
            this.node.setWorldPosition(resetPos);
        }

        return true;
    }

    public applyEdgeWobble(holeCenter: Vec3) {
        if (this._state !== WeaponState.RESTING) return;
        const rb = this.getComponent(RigidBody);
        if (!rb) return;

        const pos = this.node.worldPosition;

        const pushDir = new Vec3();
        Vec3.subtract(pushDir, pos, holeCenter);
        pushDir.y = 0;
        const dist = pushDir.length();
        if (dist > 0.01) {
            pushDir.normalize();
            const pushStrength = Math.max(0, 2.0 - dist * 0.5);
            pushDir.multiplyScalar(pushStrength);
            rb.applyForce(pushDir);
        }

        const torque = new Vec3();
        Vec3.cross(torque, Vec3.UP, pushDir);
        torque.normalize();
        torque.multiplyScalar(0.5);

        torque.x += (Math.random() - 0.5) * 0.8;
        torque.z += (Math.random() - 0.5) * 0.8;
        rb.applyTorque(torque);
    }

    private _applyTangentTorque(rb: RigidBody) {
        const pos = this.node.worldPosition;

        const radial = new Vec3();
        Vec3.subtract(radial, pos, this._holeCenter);
        radial.y = 0;
        const distFromCenter = radial.length();

        if (distFromCenter < 0.01) {
            rb.applyTorque(new Vec3(
                (Math.random() - 0.5) * 4,
                0,
                (Math.random() - 0.5) * 4
            ));
            return;
        }

        radial.normalize();

        const tangent = new Vec3(-radial.z, 0, radial.x);

        const torqueAxis = tangent.clone();

        const overlapRatio = Math.min(1.0, distFromCenter / this._holeRadius);
        const edgeFactor = 1.0 - overlapRatio;

        const baseTorque = 6.0 / Math.max(0.5, this.mass);
        const finalStrength = baseTorque * (0.3 + edgeFactor * 0.7);

        torqueAxis.multiplyScalar(finalStrength);

        if (Math.random() > 0.5) {
            torqueAxis.multiplyScalar(-1);
        }

        rb.applyTorque(torqueAxis);
    }

    private _applyPhysicsGroup(mask: number) {
        const rb = this.getComponent(RigidBody);
        if (rb) {
            rb.setGroup(PHY_GROUP.WEAPON);
            rb.setMask(mask);
        }

        const colliders = this.getComponents(Collider);
        for (const col of colliders) {
            col.setGroup(PHY_GROUP.WEAPON);
            col.setMask(mask);
        }
    }

    private _calcBoundingSize(): number {
        const s = this.node.scale;
        const box = this.getComponent(BoxCollider);
        if (box) {
            return Math.max(box.size.x * s.x, box.size.z * s.z);
        }
        const sphere = this.getComponent(SphereCollider);
        if (sphere) {
            return sphere.radius * 2 * Math.max(s.x, s.z);
        }
        return 1;
    }
}
