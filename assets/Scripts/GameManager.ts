
import {
    _decorator, Component, Node, Vec3, Prefab, instantiate, tween,
    Label, UIOpacity, UITransform, Size, Color
} from 'cc';
import { HoleController } from './HoleController';
import { WeaponItem } from './WeaponItem';
const { ccclass, property } = _decorator;

enum GamePhase {
    EATING = 0,
    BOSS_READY = 1,
}

@ccclass('GameManager')
export class GameManager extends Component {

    @property({ type: Prefab })
    public bulletPrefab: Prefab | null = null;

    @property({ type: Prefab })
    public grenadePrefab: Prefab | null = null;

    @property({ type: Prefab })
    public gunPrefab: Prefab | null = null;

    @property({ type: HoleController })
    public holeController: HoleController | null = null;

    @property({ type: Node })
    public weaponContainer: Node | null = null;

    private _phase: GamePhase = GamePhase.EATING;
    private _holeLevel: number = 1;
    private _weaponsEaten: number = 0;

    private static readonly WEAPON_ROWS: Array<[number, number, number, number]> = [
        [0, 5, 5, 6],
        [0, 3, 5, 6],
        [1, 0, 4, 5],
        [1, -2, 4, 5],
        [2, -5, 3, 4],
        [2, -7, 3, 4],
    ];

    private static readonly LEVEL_THRESHOLDS = [0, 10, 8, 6];

    start() {
        this._wireHole();
        this._placeWeapons();
    }

    private _wireHole() {
        if (!this.holeController) {
            console.warn('GameManager: holeController not assigned!');
            return;
        }
        this.holeController.onWeaponConsumed = (_size: number) => {
            this._onWeaponConsumed();
        };
    }

    private _placeWeapons() {
        const container = this.weaponContainer || this.node;
        const prefabs = [this.bulletPrefab, this.grenadePrefab, this.gunPrefab];

        for (const [prefabIdx, z, count, xSpread] of GameManager.WEAPON_ROWS) {
            const prefab = prefabs[prefabIdx];
            if (!prefab) {
                console.warn(`GameManager: No prefab at index ${prefabIdx}`);
                continue;
            }

            for (let i = 0; i < count; i++) {
                const x = count > 1
                    ? -xSpread / 2 + (xSpread / (count - 1)) * i
                    : 0;

                const node = instantiate(prefab);
                container.addChild(node);

                const rx = (Math.random() - 0.5) * 0.4;
                const rz = (Math.random() - 0.5) * 0.4;
                node.setPosition(x + rx, node.position.y, z + rz);
                node.setRotationFromEuler(0, Math.random() * 360, 0);
            }
        }
    }

    private _onWeaponConsumed() {
        if (this._phase !== GamePhase.EATING) return;

        this._weaponsEaten++;
        if (this._weaponsEaten >= 5 && this._holeLevel < 3) {
            this._holeLevel++;
            this._weaponsEaten = 0;
            this.holeController?.upgrade(this._holeLevel);
        }
    }

    private _onBossPhase() {
        console.log('=== BOSS FIGHT PHASE TRIGGERED ===');
    }
}
