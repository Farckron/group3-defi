// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

// Token A: rare academic achievements. Fixed supply, no further minting.
contract StudyCredit is ERC20 {
    constructor() ERC20("Study Credit", "STCR") {
        _mint(msg.sender, 10000 * 10 ** decimals());
    }
}
